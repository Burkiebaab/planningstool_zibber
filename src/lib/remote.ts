import type { SupabaseClient } from '@supabase/supabase-js';
import { migrateSettings } from './demo';
import { blankItem } from './planning';
import type { AppData, Item, Member, Settings } from './types';

/** Id van dit browsertabblad. Zo herkennen we onze eigen wijzigingen als ze via realtime terugkomen. */
export const CLIENT_ID = Math.random().toString(36).slice(2) + Date.now().toString(36);

export interface SettingsDoc {
  settings: Settings;
  syncIdx: number;
  lastSync: string;
}

/** Wat er volgens ons in de database staat. Items en teamleden worden op objectreferentie vergeleken. */
export interface Snapshot {
  items: Map<string, Item>;
  members: Map<string, Member>;
  projects: Set<string>;
  settings: string;
}

export interface Changes {
  items: Item[];
  itemDels: string[];
  members: { m: Member; position: number }[];
  memberDels: string[];
  projects: string[];
  projectDels: string[];
  settings: SettingsDoc | null;
}

const settingsDoc = (d: AppData): SettingsDoc => ({ settings: d.settings, syncIdx: d.syncIdx, lastSync: d.lastSync });

export const snapshotOf = (d: AppData): Snapshot => ({
  items: new Map(d.items.map((i) => [i.id, i])),
  members: new Map(d.members.map((m) => [m.id, m])),
  projects: new Set(d.projects),
  settings: JSON.stringify(settingsDoc(d)),
});

export const emptySnapshot = (): Snapshot => ({ items: new Map(), members: new Map(), projects: new Set(), settings: '' });

/** Bepaalt wat er naar de database moet. Geeft null als alles al is opgeslagen. */
export function diff(s: Snapshot, d: AppData): Changes | null {
  const itemIds = new Set(d.items.map((i) => i.id));
  const memberIds = new Set(d.members.map((m) => m.id));
  const doc = settingsDoc(d);
  const c: Changes = {
    items: d.items.filter((i) => s.items.get(i.id) !== i),
    itemDels: [...s.items.keys()].filter((id) => !itemIds.has(id)),
    members: d.members.map((m, position) => ({ m, position })).filter(({ m }) => s.members.get(m.id) !== m),
    memberDels: [...s.members.keys()].filter((id) => !memberIds.has(id)),
    projects: d.projects.filter((p) => !s.projects.has(p)),
    projectDels: [...s.projects].filter((p) => !d.projects.includes(p)),
    settings: JSON.stringify(doc) !== s.settings ? doc : null,
  };
  const empty = !c.items.length && !c.itemDels.length && !c.members.length && !c.memberDels.length && !c.projects.length && !c.projectDels.length && !c.settings;
  return empty ? null : c;
}

/** Werkt de snapshot bij nadat `c` succesvol is weggeschreven. */
export function applyToSnapshot(s: Snapshot, c: Changes) {
  c.items.forEach((i) => s.items.set(i.id, i));
  c.itemDels.forEach((id) => s.items.delete(id));
  c.members.forEach(({ m }) => s.members.set(m.id, m));
  c.memberDels.forEach((id) => s.members.delete(id));
  c.projects.forEach((p) => s.projects.add(p));
  c.projectDels.forEach((p) => s.projects.delete(p));
  if (c.settings) s.settings = JSON.stringify(c.settings);
}

const chunks = <T,>(list: T[], n: number) => Array.from({ length: Math.ceil(list.length / n) }, (_, k) => list.slice(k * n, (k + 1) * n));

const PAGE = 1000;

/** Haalt alle rijen op, ook als het er meer zijn dan Supabase per keer teruggeeft. */
async function selectAll<T>(sb: SupabaseClient, table: string, columns: string, order: [string, boolean][]): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = sb.from(table).select(columns);
    order.forEach(([col, ascending]) => (q = q.order(col, { ascending })));
    const { data, error } = await q.range(from, from + PAGE - 1);
    if (error) throw error;
    out.push(...((data || []) as T[]));
    if (!data || data.length < PAGE) return out;
  }
}

export const normalizeItem = (data: Partial<Item>): Item => ({ ...blankItem(), ...data }) as Item;
export const normalizeMember = (data: Member): Member => ({ ...data, workdays: data.workdays || [], vacations: data.vacations || [] });
export const normalizeSettingsDoc = (doc: Partial<SettingsDoc> | null | undefined): SettingsDoc => ({
  settings: migrateSettings((doc?.settings || {}) as Settings),
  syncIdx: doc?.syncIdx || 0,
  lastSync: doc?.lastSync || new Date().toISOString(),
});

/** Laadt de hele planning. Geeft null als de database nog leeg is. */
export async function fetchAll(sb: SupabaseClient): Promise<AppData | null> {
  const [items, members, projects, settings] = await Promise.all([
    selectAll<{ data: Item }>(sb, 'items', 'data', [['created_at', false], ['id', true]]),
    selectAll<{ data: Member }>(sb, 'members', 'data', [['position', true], ['created_at', true], ['id', true]]),
    selectAll<{ name: string }>(sb, 'projects', 'name', [['name', true]]),
    sb.from('settings').select('data').eq('id', 1).maybeSingle(),
  ]);
  if (settings.error) throw settings.error;
  if (!settings.data && !items.length && !members.length) return null;
  const doc = normalizeSettingsDoc(settings.data?.data as Partial<SettingsDoc> | undefined);
  return {
    items: items.map((r) => normalizeItem(r.data)),
    members: members.map((r) => normalizeMember(r.data)),
    projects: projects.map((r) => r.name),
    ...doc,
  };
}

/** Schrijft wijzigingen weg. Gooit een fout als iets mislukt; de aanroeper probeert het later opnieuw. */
export async function writeChanges(sb: SupabaseClient, c: Changes, email: string) {
  const meta = { client_id: CLIENT_ID, updated_by: email, updated_at: new Date().toISOString() };
  const ops: PromiseLike<{ error: unknown }>[] = [];
  chunks(c.items, 200).forEach((part) => ops.push(sb.from('items').upsert(part.map((i) => ({ id: i.id, data: i, ...meta })))));
  chunks(c.itemDels, 100).forEach((part) => ops.push(sb.from('items').delete().in('id', part)));
  chunks(c.members, 200).forEach((part) => ops.push(sb.from('members').upsert(part.map(({ m, position }) => ({ id: m.id, data: m, position, ...meta })))));
  chunks(c.memberDels, 100).forEach((part) => ops.push(sb.from('members').delete().in('id', part)));
  chunks(c.projects, 200).forEach((part) => ops.push(sb.from('projects').upsert(part.map((name) => ({ name })), { onConflict: 'name', ignoreDuplicates: true })));
  chunks(c.projectDels, 100).forEach((part) => ops.push(sb.from('projects').delete().in('name', part)));
  if (c.settings) ops.push(sb.from('settings').upsert({ id: 1, data: c.settings, ...meta }));
  const results = await Promise.all(ops);
  const failed = results.find((r) => r.error);
  if (failed) throw failed.error;
}

export interface RemoteHandlers {
  item: (id: string, data: Item | null) => void;
  member: (id: string, data: Member | null) => void;
  project: (name: string, present: boolean) => void;
  settings: (doc: SettingsDoc) => void;
  /** De verbinding was weg en is hersteld: alles opnieuw ophalen. */
  reconnected: () => void;
}

let channelSeq = 0;

type Row = { id?: string | number; name?: string; data?: unknown; client_id?: string | null };

/** Luistert naar wijzigingen van collega's. Geeft een functie terug om te stoppen. */
export function subscribe(sb: SupabaseClient, h: RemoteHandlers): () => void {
  const isOwn = (row: Row) => row.client_id === CLIENT_ID;
  let joined = false;
  const channel = sb
    .channel('planning-' + CLIENT_ID + '-' + ++channelSeq)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'items' }, (p) => {
      if (p.eventType === 'DELETE') return h.item(String((p.old as Row).id), null);
      const row = p.new as Row;
      if (!isOwn(row)) h.item(String(row.id), normalizeItem(row.data as Item));
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'members' }, (p) => {
      if (p.eventType === 'DELETE') return h.member(String((p.old as Row).id), null);
      const row = p.new as Row;
      if (!isOwn(row)) h.member(String(row.id), normalizeMember(row.data as Member));
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, (p) => {
      if (p.eventType === 'DELETE') h.project(String((p.old as Row).name), false);
      else h.project(String((p.new as Row).name), true);
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'settings' }, (p) => {
      if (p.eventType === 'DELETE') return;
      const row = p.new as Row;
      if (!isOwn(row)) h.settings(normalizeSettingsDoc(row.data as SettingsDoc));
    })
    .subscribe((status) => {
      if (status !== 'SUBSCRIBED') return;
      if (joined) h.reconnected();
      joined = true;
    });
  return () => {
    sb.removeChannel(channel);
  };
}
