/**
 * Vercel-functie: haalt tickets op uit Jira voor de planningstool.
 *
 * POST /api/jira-sync   body: { jql?: string, keys?: string[] }
 * Header: Authorization: Bearer <Supabase access token>
 *
 * - Alleen ingelogde @zibber.nl-gebruikers (via Google) mogen dit aanroepen.
 * - De Jira-sleutel staat alleen hier op de server (JIRA_SITE, JIRA_EMAIL, JIRA_API_TOKEN).
 * - `keys` zijn tickets die al in de planning staan maar niet meer in de JQL-resultaten
 *   voorkomen (meestal: inmiddels afgerond). Die worden los opgehaald zodat de planning
 *   ziet dat ze gesloten zijn.
 *
 * POST /api/jira-sync   body: { action: 'estimate', key: string, hours: number }
 * Zet de "Original estimate" van één ticket in Jira (uren aangepast in de planningstool).
 *
 * POST /api/jira-sync   body: { action: 'create', summary, description?, due?, hours?, priority?, labels? }
 * Maakt een ticket aan in JIRA_PROJECT (standaard MKT) voor een taak uit de planningstool.
 *
 * Dit bestand is bewust zelfstandig (geen imports uit src/), zodat Vercel het los kan draaien.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';

const ALLOWED_DOMAIN = 'zibber.nl';
const DEFAULT_JQL = 'project = MKT AND statusCategory != Done ORDER BY created DESC';
const MAX_ISSUES = 1000;
const MAX_KEYS = 100;
const FIELDS = ['summary', 'issuetype', 'status', 'priority', 'assignee', 'reporter', 'created', 'duedate', 'timeoriginalestimate', 'labels', 'components', 'parent'];

type Req = IncomingMessage & { body?: unknown };
type Res = ServerResponse;

interface JiraIssue {
  key: string;
  summary: string;
  issueType: string;
  status: string;
  statusCategory: string;
  priority: string;
  assignee: string;
  reporter: string;
  created: string;
  due: string;
  estimate: number | null;
  labels: string[];
  components: string[];
  epic: string;
}

class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

function send(res: Res, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

const origin = (raw?: string) => {
  const v = raw?.trim();
  if (!v) return '';
  try {
    return new URL(v.includes('://') ? v : 'https://' + v).origin;
  } catch {
    return '';
  }
};

/** Controleert de Supabase-sessie van de aanroeper. */
async function verifyUser(req: Req) {
  const token = /^Bearer\s+(.+)$/i.exec(String(req.headers.authorization || ''))?.[1];
  if (!token) throw new HttpError(401, 'unauthorized', 'Niet ingelogd.');
  const sbUrl = origin(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL);
  const sbKey = (process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '').trim();
  if (!sbUrl || !sbKey) throw new HttpError(500, 'supabase_not_configured', 'Supabase-instellingen ontbreken op de server.');
  const r = await fetch(sbUrl + '/auth/v1/user', { headers: { apikey: sbKey, Authorization: 'Bearer ' + token } });
  if (!r.ok) throw new HttpError(401, 'unauthorized', 'Sessie is verlopen. Log opnieuw in.');
  const user = (await r.json()) as { email?: string; app_metadata?: { providers?: string[] } };
  const email = String(user.email || '').toLowerCase();
  if (!email.endsWith('@' + ALLOWED_DOMAIN) || !(user.app_metadata?.providers || []).includes('google')) {
    throw new HttpError(403, 'forbidden', 'Geen toegang.');
  }
  return { email };
}

function jiraConfig() {
  const site = origin(process.env.JIRA_SITE);
  const email = (process.env.JIRA_EMAIL || '').trim();
  const token = (process.env.JIRA_API_TOKEN || '').trim();
  if (!site || !email || !token) throw new HttpError(503, 'not_configured', 'Jira is nog niet gekoppeld (JIRA_SITE, JIRA_EMAIL en JIRA_API_TOKEN ontbreken).');
  return { site, auth: 'Basic ' + Buffer.from(email + ':' + token).toString('base64') };
}

type Cfg = ReturnType<typeof jiraConfig>;

async function jira(cfg: Cfg, path: string, init?: RequestInit) {
  const r = await fetch(cfg.site + path, {
    ...init,
    headers: { Authorization: cfg.auth, Accept: 'application/json', 'Content-Type': 'application/json', ...(init?.headers || {}) },
  });
  if (r.status === 401 || r.status === 403) throw new HttpError(502, 'jira_auth', 'Jira weigert de inloggegevens. Controleer JIRA_EMAIL en JIRA_API_TOKEN.');
  return r;
}

type RawIssue = {
  key: string;
  fields: {
    summary?: string;
    issuetype?: { name?: string };
    status?: { name?: string; statusCategory?: { key?: string } };
    priority?: { name?: string };
    assignee?: { displayName?: string } | null;
    reporter?: { displayName?: string } | null;
    created?: string;
    duedate?: string | null;
    timeoriginalestimate?: number | null;
    labels?: string[];
    components?: { name?: string }[];
    parent?: { fields?: { summary?: string } };
  };
};

function mapIssue(i: RawIssue): JiraIssue {
  const f = i.fields || {};
  const est = f.timeoriginalestimate;
  return {
    key: i.key,
    summary: f.summary || i.key,
    issueType: f.issuetype?.name || '',
    status: f.status?.name || '',
    statusCategory: f.status?.statusCategory?.key || '',
    priority: f.priority?.name || '',
    assignee: f.assignee?.displayName || '',
    reporter: f.reporter?.displayName || '',
    created: (f.created || '').slice(0, 10),
    due: (f.duedate || '').slice(0, 10),
    // Jira bewaart de schatting in seconden.
    estimate: typeof est === 'number' && est > 0 ? Math.round((est / 3600) * 10) / 10 : null,
    labels: f.labels || [],
    components: (f.components || []).map((c) => c.name || '').filter(Boolean),
    epic: f.parent?.fields?.summary || '',
  };
}

async function search(cfg: Cfg, jql: string): Promise<JiraIssue[]> {
  const out: JiraIssue[] = [];
  let nextPageToken: string | undefined;
  do {
    const r = await jira(cfg, '/rest/api/3/search/jql', {
      method: 'POST',
      body: JSON.stringify({ jql, fields: FIELDS, maxResults: 100, ...(nextPageToken ? { nextPageToken } : {}) }),
    });
    if (r.status === 400) {
      const e = (await r.json().catch(() => ({}))) as { errorMessages?: string[] };
      throw new HttpError(400, 'jql', 'De JQL-zoekopdracht klopt niet: ' + (e.errorMessages || []).join(' '));
    }
    if (!r.ok) throw new HttpError(502, 'jira_error', 'Jira gaf een fout (' + r.status + ').');
    const page = (await r.json()) as { issues?: RawIssue[]; nextPageToken?: string; isLast?: boolean };
    out.push(...(page.issues || []).map(mapIssue));
    nextPageToken = page.isLast === false || (page.isLast === undefined && page.nextPageToken) ? page.nextPageToken : undefined;
  } while (nextPageToken && out.length < MAX_ISSUES);
  return out;
}

/** Haalt losse tickets op. Tickets die niet meer bestaan (of niet zichtbaar zijn) komen in `missing`. */
async function fetchKeys(cfg: Cfg, keys: string[]) {
  const found: JiraIssue[] = [];
  const missing: string[] = [];
  const queue = keys.slice();
  const worker = async () => {
    for (let key = queue.shift(); key; key = queue.shift()) {
      const r = await jira(cfg, '/rest/api/3/issue/' + encodeURIComponent(key) + '?fields=' + FIELDS.join(','));
      if (r.status === 404) missing.push(key);
      else if (r.ok) found.push(mapIssue((await r.json()) as RawIssue));
      else throw new HttpError(502, 'jira_error', 'Jira gaf een fout (' + r.status + ').');
    }
  };
  await Promise.all(Array.from({ length: Math.min(5, keys.length) }, worker));
  return { found, missing };
}

/** Zet de Original estimate van één ticket. Probeert eerst zonder e-mailmeldingen aan volgers. */
async function updateEstimate(cfg: Cfg, key: string, hours: number) {
  const body = JSON.stringify({ fields: { timetracking: { originalEstimate: Math.round(hours * 60) + 'm' } } });
  const put = (quiet: boolean) =>
    fetch(cfg.site + '/rest/api/3/issue/' + encodeURIComponent(key) + (quiet ? '?notifyUsers=false' : ''), {
      method: 'PUT',
      headers: { Authorization: cfg.auth, Accept: 'application/json', 'Content-Type': 'application/json' },
      body,
    });
  let r = await put(true);
  // Meldingen uitzetten mag alleen een Jira-beheerder; anders gewoon met meldingen.
  if (r.status === 403) r = await put(false);
  if (r.status === 204 || r.ok) return;
  if (r.status === 401) throw new HttpError(502, 'jira_auth', 'Jira weigert de inloggegevens. Controleer JIRA_EMAIL en JIRA_API_TOKEN.');
  if (r.status === 403) throw new HttpError(502, 'jira_forbidden', 'Het Jira-account mag dit ticket niet bewerken.');
  if (r.status === 404) throw new HttpError(404, 'not_found', 'Ticket ' + key + ' bestaat niet (meer) in Jira.');
  if (r.status === 400) {
    const e = (await r.json().catch(() => ({}))) as { errors?: Record<string, string>; errorMessages?: string[] };
    const detail = [...Object.values(e.errors || {}), ...(e.errorMessages || [])].join(' ');
    throw new HttpError(400, 'estimate_field', 'Jira accepteert de schatting niet. Staat "Original estimate" (tijdregistratie) aan op het ticketscherm? ' + detail);
  }
  throw new HttpError(502, 'jira_error', 'Jira gaf een fout (' + r.status + ').');
}

/** Kiest het tickettype: "Task"/"Taak" als dat bestaat, anders het eerste gewone (geen epic, geen subtaak) type. */
async function pickIssueType(cfg: Cfg, project: string) {
  const r = await jira(cfg, '/rest/api/3/issue/createmeta/' + encodeURIComponent(project) + '/issuetypes');
  if (r.status === 404) throw new HttpError(400, 'project', 'Project ' + project + ' bestaat niet of het Jira-account mag er geen tickets in aanmaken.');
  if (!r.ok) throw new HttpError(502, 'jira_error', 'Jira gaf een fout (' + r.status + ').');
  const meta = (await r.json()) as { issueTypes?: IssueType[]; values?: IssueType[] };
  const types = (meta.issueTypes || meta.values || []).filter((t) => !t.subtask);
  const pick = types.find((t) => /^(task|taak)$/i.test(t.name)) || types.find((t) => t.hierarchyLevel === 0) || types[0];
  if (!pick) throw new HttpError(400, 'project', 'Het Jira-account mag geen tickets aanmaken in project ' + project + '.');
  return pick;
}

type IssueType = { id: string; name: string; subtask?: boolean; hierarchyLevel?: number };

/** Jira verwacht beschrijvingen in Atlassian Document Format: één alinea per regel. */
const adf = (text: string) => ({
  type: 'doc',
  version: 1,
  content: text
    .split('\n')
    .map((line) => ({ type: 'paragraph', content: line.trim() ? [{ type: 'text', text: line }] : [] })),
});

const PRIORITY: Record<string, string> = { Hoog: 'High', Normaal: 'Medium', Laag: 'Low' };
const REQUIRED = new Set(['project', 'issuetype', 'summary']);

/**
 * Maakt een ticket aan. Velden die niet op het aanmaakscherm van Jira staan (bijv. deadline of
 * schatting) worden bij een foutmelding weggelaten en opnieuw geprobeerd; die staan in `dropped`.
 */
async function createIssue(cfg: Cfg, b: Body, userEmail: string) {
  const project = (process.env.JIRA_PROJECT || 'MKT').trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9_]*$/.test(project)) throw new HttpError(500, 'project', 'JIRA_PROJECT is ongeldig.');
  const summary = String(b.summary || '').trim().slice(0, 250);
  if (!summary) throw new HttpError(400, 'bad_request', 'Geef de taak eerst een titel.');
  const type = await pickIssueType(cfg, project);

  const lines = [String(b.description || '').trim(), '', 'Aangemaakt vanuit Zibber Marketingplanning door ' + userEmail + '.'];
  const fields: Record<string, unknown> = {
    project: { key: project },
    issuetype: { id: type.id },
    summary,
    description: adf(lines.join('\n').trim()),
  };
  const due = String(b.due || '');
  if (/^\d{4}-\d{2}-\d{2}$/.test(due)) fields.duedate = due;
  const hours = Number(b.hours);
  if (hours > 0 && hours <= 10000) fields.timetracking = { originalEstimate: Math.round(hours * 60) + 'm' };
  const prio = PRIORITY[String(b.priority || '')];
  if (prio) fields.priority = { name: prio };
  const labels = (Array.isArray(b.labels) ? b.labels : [])
    .map((l) => String(l).trim().replace(/\s+/g, '-'))
    .filter((l) => l && l.length <= 255)
    .slice(0, 10);
  if (labels.length) fields.labels = labels;

  const dropped: string[] = [];
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await fetch(cfg.site + '/rest/api/3/issue', {
      method: 'POST',
      headers: { Authorization: cfg.auth, Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields }),
    });
    if (r.status === 201 || r.ok) {
      const created = (await r.json()) as { key: string };
      return { key: created.key, issueType: type.name, dropped };
    }
    if (r.status === 401) throw new HttpError(502, 'jira_auth', 'Jira weigert de inloggegevens. Controleer JIRA_EMAIL en JIRA_API_TOKEN.');
    if (r.status === 403) throw new HttpError(502, 'jira_forbidden', 'Het Jira-account mag geen tickets aanmaken in project ' + project + '.');
    const e = (await r.json().catch(() => ({}))) as { errors?: Record<string, string>; errorMessages?: string[] };
    const bad = Object.keys(e.errors || {}).filter((f) => f in fields && !REQUIRED.has(f));
    if (r.status !== 400 || !bad.length) {
      const detail = [...Object.values(e.errors || {}), ...(e.errorMessages || [])].join(' ');
      throw new HttpError(r.status === 400 ? 400 : 502, 'create_failed', 'Jira kon het ticket niet aanmaken. ' + detail);
    }
    bad.forEach((f) => {
      delete fields[f];
      dropped.push(f);
    });
  }
  throw new HttpError(502, 'create_failed', 'Jira kon het ticket niet aanmaken.');
}

type Body = {
  action?: unknown;
  jql?: unknown;
  keys?: unknown;
  key?: unknown;
  hours?: unknown;
  summary?: unknown;
  description?: unknown;
  due?: unknown;
  priority?: unknown;
  labels?: unknown;
};

function readBody(req: Req): Body {
  const b = req.body;
  if (b && typeof b === 'object') return b as Body;
  if (typeof b === 'string') {
    try {
      return JSON.parse(b);
    } catch {
      return {};
    }
  }
  return {};
}

export default async function handler(req: Req, res: Res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'method', message: 'Gebruik POST.' });
  try {
    const user = await verifyUser(req);
    const cfg = jiraConfig();
    const body = readBody(req);

    if (body.action === 'create') {
      const created = await createIssue(cfg, body, user.email);
      return send(res, 200, { ok: true, ...created });
    }

    if (body.action === 'estimate') {
      const key = String(body.key || '').trim().toUpperCase();
      const hours = Number(body.hours);
      if (!/^[A-Z][A-Z0-9_]*-\d+$/.test(key)) throw new HttpError(400, 'bad_request', 'Ongeldig ticketnummer.');
      if (!(hours > 0 && hours <= 10000)) throw new HttpError(400, 'bad_request', 'Ongeldig aantal uren.');
      await updateEstimate(cfg, key, hours);
      return send(res, 200, { ok: true, key, hours });
    }

    const jql = typeof body.jql === 'string' && body.jql.trim() ? body.jql.trim().slice(0, 2000) : DEFAULT_JQL;
    const keys = (Array.isArray(body.keys) ? body.keys : [])
      .map((k) => String(k).trim().toUpperCase())
      .filter((k) => /^[A-Z][A-Z0-9_]*-\d+$/.test(k))
      .slice(0, MAX_KEYS);

    const issues = await search(cfg, jql);
    const seen = new Set(issues.map((i) => i.key));
    const extra = await fetchKeys(cfg, [...new Set(keys)].filter((k) => !seen.has(k)));
    send(res, 200, { site: new URL(cfg.site).host, issues: [...issues, ...extra.found], missing: extra.missing });
  } catch (err) {
    if (err instanceof HttpError) return send(res, err.status, { error: err.code, message: err.message });
    console.error(err);
    send(res, 500, { error: 'server', message: 'Er ging iets mis bij het ophalen uit Jira.' });
  }
}
