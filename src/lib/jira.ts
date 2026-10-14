import { CHANNELS, NO_PROJECT, PRIO_TO_JIRA, REQS, STATUS_TO_JIRA } from './constants';
import { iso } from './dates';
import { blankItem } from './planning';
import type { AppData, Item, JiraIssue, Member, Priority, Status } from './types';

type IssueFields = Omit<Partial<Item>, 'market' | 'channel' | 'requester'> & {
  key: string;
  market?: string;
  channel?: string;
  requester?: string;
};

/** Zet een Jira-issue om naar de velden die we in een planningsitem bewaren. */
function fromIssue(is: JiraIssue): IssueFields {
  const labels = is.labels || [];
  const comps = is.components || [];
  const st = String(is.status || '');
  const cat = String(is.statusCategory || '').toLowerCase();
  const closed = cat === 'done' || /^(done|closed|gesloten|klaar|gereed|resolved|afgerond|cancelled|geannuleerd)$/i.test(st.trim());
  const status: Status = closed
    ? 'Klaar'
    : /review/i.test(st)
      ? 'Review'
      : cat === 'indeterminate' || /progress|bezig|uitvoering/i.test(st)
        ? 'Bezig'
        : 'To do';
  const pr = String(is.priority || '');
  const priority: Priority = /highest|high|hoog|critical|blocker/i.test(pr) ? 'Hoog' : /low|laag/i.test(pr) ? 'Laag' : 'Normaal';
  const market = labels.map((l) => String(l).toUpperCase()).find((l) => ['NL', 'BE', 'DE'].includes(l));
  const channel = CHANNELS.find((c) => labels.some((l) => String(l).toLowerCase() === c.toLowerCase()));
  const requester = REQS.find((r) => comps.some((c) => String(c).toLowerCase() === r.toLowerCase()));
  const est = is.estimate == null || isNaN(is.estimate) ? null : Number(is.estimate);
  return {
    key: is.key,
    title: is.summary || is.key,
    type: is.issueType || 'Task',
    jiraStatus: st,
    status,
    priority,
    jiraAssignee: is.assignee || '',
    reporter: is.reporter || '',
    created: is.created || iso(new Date()),
    due: is.due || '',
    estimate: est,
    jiraEstimate: est,
    labels,
    components: comps,
    epic: is.epic || '',
    project: is.epic || NO_PROJECT,
    jiraClosed: closed,
    market,
    channel,
    requester,
  };
}

export function toIssue(i: Item, members: Member[]): JiraIssue {
  const m = members.find((x) => x.id === i.assignee);
  return {
    key: i.key,
    summary: i.title,
    issueType: i.type,
    status: i.jiraStatus || STATUS_TO_JIRA[i.status],
    priority: PRIO_TO_JIRA[i.priority],
    assignee: m ? m.name : '',
    reporter: i.reporter,
    created: i.created,
    due: i.due,
    estimate: i.estimate,
    labels: i.labels,
    components: i.components,
    epic: i.epic,
  };
}

/**
 * Verwerkt Jira-issues in de planning. Matching gebeurt op Issue key:
 * bestaande items krijgen bijgewerkte Jira-velden, de planning blijft staan.
 */
export function mergeIssues(data: AppData, issues: JiraIssue[], demo: boolean) {
  const items = data.items.slice();
  const projects = data.projects.slice();
  let added = 0;
  let updated = 0;
  let closed = 0;
  const findMember = (n?: string) => {
    if (!n) return null;
    const m = data.members.find((x) => x.name.toLowerCase() === String(n).toLowerCase());
    return m ? m.id : null;
  };

  issues.forEach((is) => {
    if (!is.key) return;
    const f = fromIssue(is);
    const asg = findMember(is.assignee);
    if (f.epic && !projects.includes(f.epic)) projects.push(f.epic);
    const ix = items.findIndex((i) => i.source === 'jira' && i.key === f.key);
    if (ix >= 0) {
      const o = items[ix];
      const p: Record<string, unknown> = { ...f };
      // Uren: de tool is leidend. Een nieuwe schatting uit Jira nemen we alleen over als de uren in de
      // tool sinds de vorige sync niet zijn aangepast (of nog leeg zijn).
      const lastJira = o.jiraEstimate === undefined ? o.estimate : o.jiraEstimate;
      const editedInTool = o.estimate != null && o.estimate !== lastJira;
      if (f.estimate == null || editedInTool) delete p.estimate;
      (['due', 'market', 'channel', 'requester'] as const).forEach((k) => {
        if (!p[k]) delete p[k];
      });
      // Project = epic. `o.epic` is de epic zoals Jira die bij de vorige sync had. Is het project in de
      // tool daarna gewijzigd (en nog niet in Jira terechtgekomen), dan blijft de keuze uit de tool staan.
      const projectEditedInTool = !!o.epic && o.project !== o.epic;
      if (projectEditedInTool || (!f.epic && !o.epic)) delete p.project;
      if (!o.jiraClosed && f.jiraClosed) closed++;
      const n = { ...o, ...p } as Item;
      if (!n.assignee && asg) n.assignee = asg;
      // Alleen vervangen als Jira echt iets anders zegt. Zo blijft het item ongemoeid (en wordt het niet
      // opnieuw opgeslagen) en overschrijft een sync nooit een gelijktijdige wijziging van een collega.
      const keys = Object.keys(n) as (keyof Item)[];
      if (keys.some((k) => JSON.stringify(n[k]) !== JSON.stringify(o[k]))) {
        items[ix] = n;
        updated++;
      }
    } else {
      if (f.project && !projects.includes(f.project)) projects.push(f.project);
      items.unshift({
        ...blankItem(),
        ...f,
        market: f.market || 'Alle',
        channel: f.channel || '',
        requester: f.requester || '',
        // Vaste id per ticket: als twee collega's tegelijk synchroniseren, ontstaat er geen dubbel item.
        id: 'jira-' + f.key,
        source: 'jira',
        assignee: asg,
        isNew: true,
        demo,
      });
      added++;
    }
  });

  return { data: { ...data, items, projects }, added, updated, closed };
}

function parseCSV(t: string): string[][] {
  const first = t.split('\n')[0];
  const dl = first.split(';').length > first.split(',').length ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let f = '';
  let q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) {
      if (c === '"') {
        if (t[i + 1] === '"') {
          f += '"';
          i++;
        } else q = false;
      } else f += c;
    } else if (c === '"') q = true;
    else if (c === dl) {
      row.push(f);
      f = '';
    } else if (c === '\n') {
      row.push(f);
      rows.push(row);
      row = [];
      f = '';
    } else if (c !== '\r') f += c;
  }
  if (f || row.length) {
    row.push(f);
    rows.push(row);
  }
  return rows;
}

const EN_M: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11, mrt: 2, mei: 4, okt: 9 };

/** Jira-datums ("14/Oct/26 9:30 AM", "2026-10-14", "14-10-2026") naar ISO. */
function jiraDate(s: string): string {
  if (!s) return '';
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/(\d{1,2})\/(\w{3})\/(\d{2,4})/);
  if (m && EN_M[m[2].toLowerCase()] != null) {
    let y = +m[3];
    if (y < 100) y += 2000;
    return iso(new Date(y, EN_M[m[2].toLowerCase()], +m[1]));
  }
  m = s.match(/(\d{1,2})[-./](\d{1,2})[-./](\d{4})/);
  if (m) return iso(new Date(+m[3], +m[2] - 1, +m[1]));
  const d = new Date(s);
  return isNaN(d.getTime()) ? '' : iso(d);
}

/** Leest een CSV-export uit Jira. Geeft een lege lijst als de kolom "Issue key" ontbreekt. */
export function csvToIssues(text: string): JiraIssue[] {
  const rows = parseCSV(text.replace(/^﻿/, ''));
  if (rows.length < 2) return [];
  const h = rows[0].map((x) => x.trim().toLowerCase());
  const ix = (...n: string[]) => h.findIndex((x) => n.includes(x));
  const all = (...n: string[]) => h.map((x, i) => (n.includes(x) ? i : -1)).filter((i) => i >= 0);
  const ki = ix('issue key', 'key');
  const si = ix('summary', 'samenvatting');
  const ti = ix('issue type');
  const sti = ix('status');
  const pi = ix('priority');
  const ai = ix('assignee');
  const ri = ix('reporter');
  const ci = ix('created');
  const di = ix('due date', 'due');
  const ei = ix('original estimate');
  const li = all('labels');
  const coi = all('component/s', 'components');
  const epi = ix('parent summary', 'custom field (epic link)', 'epic link', 'epic name', 'parent');
  if (ki < 0) return [];

  return rows
    .slice(1)
    .filter((r) => r[ki] && r[ki].trim())
    .map((r) => {
      const g = (i: number) => (i >= 0 ? (r[i] || '').trim() : '');
      const est = g(ei);
      let n: number | null = null;
      if (est) {
        const v = parseFloat(est.replace(',', '.'));
        if (/h/i.test(est)) n = v;
        else if (/d/i.test(est)) n = v * 8;
        // Jira exporteert Original Estimate in seconden.
        else if (!isNaN(v)) n = v > 100 ? Math.round((v / 3600) * 10) / 10 : v;
      }
      return {
        key: g(ki),
        summary: g(si),
        issueType: g(ti),
        status: g(sti),
        priority: g(pi),
        assignee: g(ai),
        reporter: g(ri),
        created: jiraDate(g(ci)) || iso(new Date()),
        due: jiraDate(g(di)),
        estimate: n,
        labels: li.map(g).filter(Boolean).flatMap((x) => x.split(/[;,\s]+/)).filter(Boolean),
        components: coi.map(g).filter(Boolean),
        epic: g(epi),
      };
    });
}
