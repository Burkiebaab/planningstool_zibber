import { supabase } from './supabase';
import type { JiraIssue } from './types';

export type LiveResult =
  | { ok: true; site: string; issues: JiraIssue[]; missing: string[] }
  | { ok: false; code: string; message: string };

/**
 * Haalt tickets op via /api/jira-sync (de Jira-sleutel staat alleen op de server).
 * `keys`: open Jira-items uit de planning, zodat ook afgeronde tickets worden bijgewerkt.
 */
export async function fetchLiveIssues(jql: string, keys: string[]): Promise<LiveResult> {
  if (!supabase) return { ok: false, code: 'local', message: 'Geen database gekoppeld.' };
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { ok: false, code: 'unauthorized', message: 'Niet ingelogd.' };
  try {
    const r = await fetch('/api/jira-sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ jql, keys }),
    });
    const body = await r.json().catch(() => null);
    if (r.ok && body && Array.isArray(body.issues)) return { ok: true, site: String(body.site || ''), issues: body.issues, missing: body.missing || [] };
    // Geen functie gevonden (bijv. lokaal met `npm run dev`): gedraag je als "niet gekoppeld".
    if (r.status === 404 || !body) return { ok: false, code: 'not_configured', message: 'De Jira-koppeling is niet beschikbaar.' };
    return { ok: false, code: String(body.error || 'error'), message: String(body.message || 'Ophalen uit Jira is mislukt.') };
  } catch {
    return { ok: false, code: 'network', message: 'Geen verbinding met de server.' };
  }
}
