import { supabase } from './supabase';
import type { JiraEpic, JiraIssue } from './types';

export type LiveResult =
  | { ok: true; site: string; issues: JiraIssue[]; missing: string[]; epics: JiraEpic[] | null }
  | { ok: false; code: string; message: string };

/** Roept /api/jira-sync aan met de sessie van de ingelogde gebruiker. */
async function callApi(payload: unknown): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; code: string; message: string }> {
  if (!supabase) return { ok: false, code: 'local', message: 'Geen database gekoppeld.' };
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { ok: false, code: 'unauthorized', message: 'Niet ingelogd.' };
  try {
    const r = await fetch('/api/jira-sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify(payload),
    });
    const body = await r.json().catch(() => null);
    if (r.ok && body) return { ok: true, body };
    // Geen functie gevonden (bijv. lokaal met `npm run dev`): gedraag je als "niet gekoppeld".
    if (r.status === 404 && !body?.error) return { ok: false, code: 'not_configured', message: 'De Jira-koppeling is niet beschikbaar.' };
    if (!body) return { ok: false, code: 'not_configured', message: 'De Jira-koppeling is niet beschikbaar.' };
    return { ok: false, code: String(body.error || 'error'), message: String(body.message || 'De Jira-koppeling gaf een fout.') };
  } catch {
    return { ok: false, code: 'network', message: 'Geen verbinding met de server.' };
  }
}

/**
 * Haalt tickets op via /api/jira-sync (de Jira-sleutel staat alleen op de server).
 * `keys`: open Jira-items uit de planning, zodat ook afgeronde tickets worden bijgewerkt.
 */
export async function fetchLiveIssues(jql: string, keys: string[]): Promise<LiveResult> {
  const r = await callApi({ jql, keys });
  if (!r.ok) return r;
  if (!Array.isArray(r.body.issues)) return { ok: false, code: 'error', message: 'Onverwacht antwoord van de server.' };
  const epics = Array.isArray(r.body.epics) ? (r.body.epics as JiraEpic[]) : null;
  return { ok: true, site: String(r.body.site || ''), issues: r.body.issues as JiraIssue[], missing: (r.body.missing as string[]) || [], epics };
}

/** Zet de Original estimate van een ticket in Jira. */
export async function pushEstimate(key: string, hours: number): Promise<{ ok: true } | { ok: false; message: string }> {
  const r = await callApi({ action: 'estimate', key, hours });
  return r.ok ? { ok: true } : { ok: false, message: r.message };
}

export interface NewIssue {
  summary: string;
  description: string;
  due: string;
  hours: number | null;
  priority: string;
  labels: string[];
  parent: string | null;
}

/** Maakt een ticket aan in Jira. `dropped`: velden die Jira niet accepteerde (niet op het scherm). */
export async function createJiraIssue(issue: NewIssue): Promise<{ ok: true; key: string; issueType: string; dropped: string[] } | { ok: false; message: string }> {
  const r = await callApi({ action: 'create', ...issue });
  if (!r.ok) return { ok: false, message: r.message };
  if (typeof r.body.key !== 'string') return { ok: false, message: 'Onverwacht antwoord van de server.' };
  return { ok: true, key: r.body.key, issueType: String(r.body.issueType || 'Task'), dropped: (r.body.dropped as string[]) || [] };
}

/** Zet de epic (parent) van een ticket in Jira; null haalt het ticket uit de epic. */
export async function pushParent(key: string, parent: string | null): Promise<{ ok: true } | { ok: false; message: string }> {
  const r = await callApi({ action: 'parent', key, parent });
  return r.ok ? { ok: true } : { ok: false, message: r.message };
}
