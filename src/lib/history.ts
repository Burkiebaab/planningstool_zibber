import type { SupabaseClient } from '@supabase/supabase-js';
import { STORAGE_KEY } from './constants';
import { fmt, fmtH, toDate, weekNo } from './dates';
import type { Allocation, AppData, Item, Member } from './types';

/**
 * Wijzigingsgeschiedenis: wie wijzigde wat en wanneer.
 *
 * Wijzigingen worden bepaald door de vorige en nieuwe stand van een item of teamlid te vergelijken.
 * Met Supabase staan ze in de tabel `history` (gedeeld met collega's); zonder Supabase in deze browser.
 */
export interface HistoryEntry {
  id: string;
  /** Tijdstip (ISO). */
  at: string;
  /** E-mailadres van wie de wijziging deed, of 'jira' voor de Jira-sync. */
  by: string;
  byName: string;
  kind: 'item' | 'member';
  /** Id van het item of teamlid. */
  ref: string;
  /** Titel van het item of naam van het teamlid op het moment van de wijziging. */
  title: string;
  /** Technische sleutel van wat er wijzigde (bijv. 'estimate' of 'alloc:<teamlid>|<week>'). */
  field: string;
  /** Leesbare omschrijving van wat er wijzigde, bijv. 'Uren'. */
  label: string;
  from: string;
  to: string;
}

export type Change = Pick<HistoryEntry, 'field' | 'label' | 'from' | 'to'>;
export type Draft = Omit<HistoryEntry, 'id' | 'at' | 'by' | 'byName'>;

export const JIRA_ACTOR = { email: 'jira', name: 'Jira-sync' };

/** Opeenvolgende wijzigingen van dezelfde persoon aan hetzelfde veld binnen deze tijd worden samengevoegd (typen, schuiven). */
const MERGE_MS = 10 * 60 * 1000;
const LOCAL_KEY = STORAGE_KEY + '-history';
const LOCAL_MAX = 1000;
const CACHE_MAX = 3000;

const EMPTY = '—';
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const short = (s: string, n = 80) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
const txt = (v: string | null | undefined) => (v && String(v).trim() ? short(String(v).trim()) : EMPTY);
const hours = (h: number | null | undefined) => (h == null ? EMPTY : fmtH(h) + 'u');
const date = (s: string | null | undefined) => (s ? fmt(s) : EMPTY);
const week = (w: string) => 'wk ' + weekNo(toDate(w));

type Names = (memberId: string | null | undefined) => string;

const RECUR: Record<string, string> = { '': 'Niet terugkerend', wekelijks: 'Wekelijks', maandelijks: 'Maandelijks' };

/** Velden van een item die in de geschiedenis komen, met hoe ze worden weergegeven. */
const ITEM_FIELDS: [keyof Item, string, (v: never, names: Names) => string][] = [
  ['title', 'Titel', txt],
  ['project', 'Project', txt],
  ['status', 'Status', txt],
  ['jiraStatus', 'Jira-status', txt],
  ['priority', 'Prioriteit', txt],
  ['assignee', 'Toegewezen aan', (v: string | null, names) => (v ? names(v) : 'Niemand')],
  ['estimate', 'Geschatte tijd', hours],
  ['start', 'Startdatum', date],
  ['due', 'Deadline', date],
  ['market', 'Markt', txt],
  ['channel', 'Kanaal', txt],
  ['requesterName', 'Aanvrager', txt],
  ['requester', 'Afdeling', txt],
  ['recurring', 'Terugkerend', (v: string) => RECUR[v || ''] || v],
  ['note', 'Notitie', txt],
  ['noPlanning', 'Niet inplannen', (v: boolean | undefined) => (v ? 'Ja' : 'Nee')],
  ['jiraClosed', 'Gesloten in Jira', (v: boolean) => (v ? 'Ja' : 'Nee')],
];

const blockText = (a: Allocation | undefined) => (a ? hours(a.h) + (a.done ? ', afgevinkt' : '') : EMPTY);

/** Verschillen in de planning (blokken per teamlid en week). Een verschoven blok wordt één regel. */
function allocChanges(o: Allocation[], n: Allocation[], names: Names): Change[] {
  const key = (a: Allocation) => a.m + '|' + a.w;
  const om = new Map(o.map((a) => [key(a), a]));
  const nm = new Map(n.map((a) => [key(a), a]));
  const removed = o.filter((a) => !nm.has(key(a)));
  const added = n.filter((a) => !om.has(key(a)));
  const where = (a: Allocation) => names(a.m) + ', ' + week(a.w);
  const out: Change[] = [];

  if (removed.length === 1 && added.length === 1) {
    const [r, a] = [removed[0], added[0]];
    out.push({ field: 'move:' + key(r) + '>' + key(a), label: 'Planning verschoven', from: where(r) + ' (' + hours(r.h) + ')', to: where(a) + ' (' + hours(a.h) + ')' });
  } else {
    removed.forEach((a) => out.push({ field: 'alloc:' + key(a), label: 'Planning ' + where(a), from: blockText(a), to: EMPTY }));
    added.forEach((a) => out.push({ field: 'alloc:' + key(a), label: 'Planning ' + where(a), from: EMPTY, to: blockText(a) }));
  }
  n.forEach((a) => {
    const b = om.get(key(a));
    if (!b) return;
    if ((+b.h || 0) !== (+a.h || 0)) out.push({ field: 'alloc:' + key(a), label: 'Planning ' + where(a), from: hours(b.h), to: hours(a.h) });
    if (!!b.done !== !!a.done) out.push({ field: 'done:' + key(a), label: 'Afgevinkt ' + where(a), from: b.done ? 'Ja' : 'Nee', to: a.done ? 'Ja' : 'Nee' });
  });
  return out;
}

/** Afgevinkte weken van een terugkerende taak. */
function recurDoneChanges(o: string[], n: string[], names: Names): Change[] {
  const label = (k: string) => {
    const [m, w] = k.split('|');
    return 'Afgevinkt ' + names(m) + ', ' + week(w);
  };
  return [
    ...n.filter((k) => !o.includes(k)).map((k) => ({ field: 'done:' + k, label: label(k), from: 'Nee', to: 'Ja' })),
    ...o.filter((k) => !n.includes(k)).map((k) => ({ field: 'done:' + k, label: label(k), from: 'Ja', to: 'Nee' })),
  ];
}

/** Wat er aan een item is veranderd. `o` of `n` ontbreekt bij aanmaken of verwijderen. */
export function itemChanges(o: Item | undefined, n: Item | undefined, names: Names): Change[] {
  if (!o && n) {
    const label = n.source === 'jira' ? 'Binnengekomen uit Jira' : n.recurring ? 'Terugkerende taak aangemaakt' : 'Taak aangemaakt';
    return [{ field: 'created', label, from: '', to: '' }];
  }
  if (o && !n) return [{ field: 'deleted', label: 'Verwijderd', from: '', to: '' }];
  if (!o || !n) return [];
  const out: Change[] = [];
  ITEM_FIELDS.forEach(([k, label, show]) => {
    if (same(o[k], n[k])) return;
    // Lege waarden die alleen van vorm verschillen (undefined, '', false) tellen niet.
    if (!o[k] && !n[k] && k !== 'estimate') return;
    out.push({ field: k, label, from: show(o[k] as never, names), to: show(n[k] as never, names) });
  });
  if (o.source !== n.source && n.source === 'jira') out.push({ field: 'source', label: 'Omgezet naar Jira-ticket', from: '', to: n.key });
  if (!same(o.allocations, n.allocations)) out.push(...allocChanges(o.allocations || [], n.allocations || [], names));
  if (!same(o.recurDone, n.recurDone)) out.push(...recurDoneChanges(o.recurDone || [], n.recurDone || [], names));
  return out;
}

const DAY = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'];
const vacText = (m: Member) =>
  (m.vacations || []).map((v) => fmt(v.from) + (v.to && v.to !== v.from ? ' t/m ' + fmt(v.to) : '') + (v.label ? ' (' + v.label + ')' : '')).join(', ') || EMPTY;

const MEMBER_FIELDS: [string, string, (m: Member) => string][] = [
  ['name', 'Naam', (m) => txt(m.name)],
  ['role', 'Rol', (m) => txt(m.role)],
  ['hours', 'Uren per week', (m) => hours(m.hours)],
  ['reserve', 'Niet planbaar', (m) => (+(m.reserve ?? 0) || 0) + '%'],
  ['workdays', 'Werkdagen', (m) => (m.workdays || []).slice().sort().map((d) => DAY[d - 1]).join(', ') || EMPTY],
  ['type', 'Type', (m) => m.type],
  ['vacations', 'Vrije dagen', vacText],
  ['archived', 'Gearchiveerd', (m) => (m.archived ? 'Ja' : 'Nee')],
];

/** Wat er aan een teamlid is veranderd. */
export function memberChanges(o: Member | undefined, n: Member | undefined): Change[] {
  if (!o && n) return [{ field: 'created', label: 'Teamlid toegevoegd', from: '', to: '' }];
  if (o && !n) return [{ field: 'deleted', label: 'Teamlid verwijderd', from: '', to: '' }];
  if (!o || !n) return [];
  return MEMBER_FIELDS.map(([field, label, show]) => ({ field, label, from: show(o), to: show(n) })).filter((c) => c.from !== c.to);
}

/**
 * Alle wijzigingen tussen de vorige stand (`oldItems`, `oldMembers`) en `next`.
 * Items en teamleden die als object gelijk zijn gebleven, worden overgeslagen.
 */
export function collect(
  oldItems: Map<string, Item>,
  oldMembers: Map<string, Member>,
  next: AppData,
  jira?: Map<string, Item>,
  converted?: Map<string, string>,
): { drafts: Draft[]; jiraDrafts: Draft[] } {
  const members = new Map(next.members.map((m) => [m.id, m]));
  const names: Names = (id) => (id ? members.get(id)?.name || oldMembers.get(id)?.name || 'Onbekend' : 'Niemand');
  const drafts: Draft[] = [];
  const jiraDrafts: Draft[] = [];
  const add = (list: Draft[], kind: Draft['kind'], ref: string, title: string, cs: Change[]) => cs.forEach((c) => list.push({ kind, ref, title, ...c }));

  const itemIds = new Set<string>();
  next.items.forEach((n) => {
    itemIds.add(n.id);
    // Een handmatige taak die een Jira-ticket werd, krijgt een nieuwe id: vergelijk met de oude taak.
    const was = converted?.get(n.id);
    if (was && !oldItems.has(n.id)) itemIds.add(was);
    const o = oldItems.get(n.id) || (was ? oldItems.get(was) : undefined);
    if (o === n) return;
    // Is (een deel van) de wijziging door de Jira-sync gedaan, dan splitsen we: oud → Jira-versie → huidige stand.
    const j = jira?.get(n.id);
    if (j) {
      add(jiraDrafts, 'item', n.id, j.title, itemChanges(o, j, names));
      if (j !== n) add(drafts, 'item', n.id, n.title, itemChanges(j, n, names));
    } else add(drafts, 'item', n.id, n.title, itemChanges(o, n, names));
  });
  oldItems.forEach((o, id) => {
    if (!itemIds.has(id)) add(drafts, 'item', id, o.title, itemChanges(o, undefined, names));
  });

  next.members.forEach((n) => {
    const o = oldMembers.get(n.id);
    if (o !== n) add(drafts, 'member', n.id, n.name, memberChanges(o, n));
  });
  oldMembers.forEach((o, id) => {
    if (!members.has(id)) add(drafts, 'member', id, o.name, memberChanges(o, undefined));
  });
  return { drafts, jiraDrafts };
}

// ── Opslag ─────────────────────────────────────────────────────────────

type Row = {
  id: string;
  at: string;
  by_email: string;
  by_name: string;
  kind: string;
  ref: string;
  title: string;
  field: string;
  label: string;
  from_text: string;
  to_text: string;
};

const toRow = (e: HistoryEntry): Row => ({
  id: e.id,
  at: e.at,
  by_email: e.by,
  by_name: e.byName,
  kind: e.kind,
  ref: e.ref,
  title: e.title,
  field: e.field,
  label: e.label,
  from_text: e.from,
  to_text: e.to,
});

const fromRow = (r: Row): HistoryEntry => ({
  id: r.id,
  at: r.at,
  by: r.by_email || '',
  byName: r.by_name || r.by_email || '',
  kind: r.kind === 'member' ? 'member' : 'item',
  ref: r.ref,
  title: r.title || '',
  field: r.field,
  label: r.label,
  from: r.from_text || '',
  to: r.to_text || '',
});

const newId = () => 'h' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export interface Pending {
  drafts: Draft[];
  jiraDrafts: Draft[];
  jira: Map<string, Item>;
  converted: Map<string, string>;
}

export interface HistoryQuery {
  /** Alleen dit item of teamlid. */
  ref?: string;
  limit: number;
}

/**
 * Bewaart en leest de geschiedenis. Eén exemplaar per geopende app; houdt de laatst getoonde
 * regels bij en meldt nieuwe regels (ook van collega's, via realtime) aan de schermen.
 */
export class HistoryLog {
  private listeners = new Set<() => void>();
  /** Laatste eigen regel per item/teamlid + veld, om snel opeenvolgende wijzigingen samen te voegen. */
  private recent = new Map<string, HistoryEntry>();
  /** Items zoals de Jira-sync ze heeft neergezet, tot de wijzigingen zijn vastgelegd. */
  readonly jiraVersions = new Map<string, Item>();
  /** Nieuwe id → oude id van handmatige taken die net een Jira-ticket zijn geworden. */
  readonly converted = new Map<string, string>();
  /** Regels die we kennen (eigen en ontvangen), nieuwste eerst. Alleen voor de lokale modus de volledige lijst. */
  private cache: HistoryEntry[] = [];
  /** Waarom de geschiedenis niet werkt (bijv. tabel ontbreekt), of null. */
  error: string | null = null;
  private stop: (() => void) | null = null;

  constructor(
    private sb: SupabaseClient | null,
    private actor: { email: string; name: string },
  ) {
    if (!sb) this.cache = readLocal();
  }

  get remote() {
    return !!this.sb;
  }

  onChange(fn: () => void) {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  }

  private emit() {
    this.listeners.forEach((fn) => fn());
  }

  /**
   * Bepaalt de wijzigingen tussen de vorige stand en `next`. Vastleggen gebeurt pas met `commit`,
   * zodat een mislukte (en later herhaalde) schrijfactie geen dubbele regels geeft.
   */
  prepare(oldItems: Map<string, Item>, oldMembers: Map<string, Member>, next: AppData): Pending {
    const jira = new Map(this.jiraVersions);
    const converted = new Map(this.converted);
    return { ...collect(oldItems, oldMembers, next, jira, converted), jira, converted };
  }

  commit(p: Pending) {
    p.jira.forEach((v, id) => {
      if (this.jiraVersions.get(id) === v) this.jiraVersions.delete(id);
    });
    p.converted.forEach((_, id) => this.converted.delete(id));
    void this.record(p.jiraDrafts, JIRA_ACTOR);
    void this.record(p.drafts);
  }

  /** Legt wijzigingen vast. Fouten worden gelogd maar blokkeren het opslaan van de planning niet. */
  async record(drafts: Draft[], actor = this.actor) {
    if (!drafts.length) return;
    const now = new Date();
    const upserts: HistoryEntry[] = [];
    const deletes: string[] = [];
    drafts.forEach((d) => {
      const k = d.kind + '|' + d.ref + '|' + d.field + '|' + actor.email;
      const prev = this.recent.get(k);
      const mergeable = prev && now.getTime() - new Date(prev.at).getTime() < MERGE_MS && !/^(created|deleted|move:)/.test(d.field);
      if (prev && mergeable) {
        const merged: HistoryEntry = { ...prev, at: now.toISOString(), title: d.title, label: d.label, to: d.to };
        if (merged.from === merged.to && merged.from !== '') {
          // Terug naar de oude waarde: niets veranderd.
          this.recent.delete(k);
          deletes.push(prev.id);
          const ix = upserts.findIndex((u) => u.id === prev.id);
          if (ix >= 0) upserts.splice(ix, 1);
        } else {
          this.recent.set(k, merged);
          const ix = upserts.findIndex((u) => u.id === prev.id);
          if (ix >= 0) upserts[ix] = merged;
          else upserts.push(merged);
        }
        return;
      }
      const e: HistoryEntry = { ...d, id: newId(), at: now.toISOString(), by: actor.email, byName: actor.name };
      this.recent.set(k, e);
      upserts.push(e);
    });

    this.apply(upserts, deletes);
    if (!this.sb) {
      writeLocal(this.cache);
      return;
    }
    try {
      if (upserts.length) {
        const { error } = await this.sb.from('history').upsert(upserts.map(toRow));
        if (error) throw error;
      }
      if (deletes.length) {
        const { error } = await this.sb.from('history').delete().in('id', deletes);
        if (error) throw error;
      }
      this.setError(null);
    } catch (err) {
      console.warn('Geschiedenis niet opgeslagen', err);
      this.setError(describe(err));
    }
  }

  private setError(e: string | null) {
    if (e === this.error) return;
    this.error = e;
    this.emit();
  }

  /** Verwerkt nieuwe of gewijzigde regels in de cache. */
  private apply(upserts: HistoryEntry[], deletes: string[]) {
    if (!upserts.length && !deletes.length) return;
    const gone = new Set([...deletes, ...upserts.map((u) => u.id)]);
    this.cache = [...upserts, ...this.cache.filter((e) => !gone.has(e.id))].sort((a, b) => b.at.localeCompare(a.at));
    this.cache = this.cache.slice(0, this.sb ? CACHE_MAX : LOCAL_MAX);
    this.emit();
  }

  /** Regels uit de cache die bij de vraag passen. */
  cached(q: HistoryQuery): HistoryEntry[] {
    return this.cache.filter((e) => !q.ref || e.ref === q.ref).slice(0, q.limit);
  }

  /** Haalt regels op (met Supabase uit de database; lokaal uit de cache). Geeft ook terug of er meer zijn. */
  async load(q: HistoryQuery): Promise<{ entries: HistoryEntry[]; more: boolean }> {
    if (!this.sb) {
      const all = this.cache.filter((e) => !q.ref || e.ref === q.ref);
      return { entries: all.slice(0, q.limit), more: all.length > q.limit };
    }
    let query = this.sb.from('history').select('*').order('at', { ascending: false }).limit(q.limit + 1);
    if (q.ref) query = query.eq('ref', q.ref);
    const { data, error } = await query;
    if (error) {
      this.setError(describe(error));
      throw error;
    }
    this.setError(null);
    const rows = ((data || []) as Row[]).map(fromRow);
    // Bewaren, zodat realtime-updates en eigen wijzigingen erop aansluiten.
    const known = new Set(this.cache.map((e) => e.id));
    this.apply(
      rows.filter((r) => !known.has(r.id)),
      [],
    );
    return { entries: rows.slice(0, q.limit), more: rows.length > q.limit };
  }

  /** Luistert naar regels van collega's. */
  start() {
    if (!this.sb || this.stop) return;
    const sb = this.sb;
    const channel = sb
      .channel('history-' + newId())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'history' }, (p) => {
        if (p.eventType === 'DELETE') this.apply([], [String((p.old as Row).id)]);
        else this.apply([fromRow(p.new as Row)], []);
      })
      .subscribe();
    this.stop = () => void sb.removeChannel(channel);
  }

  dispose() {
    this.stop?.();
    this.stop = null;
  }
}

function describe(err: unknown): string {
  const msg = typeof err === 'object' && err && 'message' in err ? String((err as { message: unknown }).message) : String(err);
  if (/does not exist|schema cache|could not find the table/i.test(msg)) return 'De tabel voor de geschiedenis bestaat nog niet. Voer supabase/schema.sql opnieuw uit in Supabase.';
  return 'Geschiedenis niet beschikbaar: ' + msg;
}

function readLocal(): HistoryEntry[] {
  try {
    const v = JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function writeLocal(list: HistoryEntry[]) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(list.slice(0, LOCAL_MAX)));
  } catch {
    /* opslag vol of geblokkeerd */
  }
}

/** "Uren: 8u → 12u", of alleen het label bij aanmaken/verwijderen. */
export function entryText(e: Pick<HistoryEntry, 'label' | 'from' | 'to'>): string {
  if (!e.from && !e.to) return e.label;
  if (!e.from) return e.label + ': ' + e.to;
  return e.label + ': ' + e.from + ' → ' + e.to;
}
