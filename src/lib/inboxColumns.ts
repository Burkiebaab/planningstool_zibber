import { NO_PROJECT, PRIO } from './constants';
import { addDays, iso, monday, toDate } from './dates';
import { personOf } from './planning';
import type { Item, Member } from './types';

export type ColKey = 'prio' | 'title' | 'requester' | 'assignee' | 'created' | 'due' | 'hours';
export type SortDir = 1 | -1;
export interface InboxSort {
  key: ColKey;
  dir: SortDir;
}
/** Per kolom de aangevinkte groepen; ontbreekt of leeg = geen filter. */
export type ColFilters = Partial<Record<ColKey, string[]>>;

export interface ColCtx {
  byId: Record<string, Member>;
  tIso: string;
}

interface ColDef {
  label: string;
  /** Kop boven de filterlijst in het kolommenu. */
  filterLabel: string;
  /** Groep waarin een item valt (wat je in het kolommenu aanvinkt). */
  bucket: (i: Item, c: ColCtx) => string;
  /** Vaste volgorde van groepen; zonder volgorde alfabetisch. */
  order?: string[];
  /** Sorteerwaarde; null komt altijd onderaan. */
  value: (i: Item, c: ColCtx) => string | number | null;
}

const UNASSIGNED = 'Niet toegewezen';
const assigneeName = (i: Item, c: ColCtx) => {
  const m = c.byId[i.assignee || ''];
  if (m) return m.name;
  return i.jiraAssignee ? i.jiraAssignee + ' (Jira)' : UNASSIGNED;
};
const days = (from: string, to: string) => Math.round((toDate(to).getTime() - toDate(from).getTime()) / 864e5);

export const COLUMNS: Record<ColKey, ColDef> = {
  prio: {
    label: 'Prioriteit',
    filterLabel: 'Prioriteit',
    bucket: (i) => i.priority,
    order: ['Hoog', 'Normaal', 'Laag'],
    value: (i) => PRIO[i.priority],
  },
  title: {
    label: 'Werkzaamheid',
    filterLabel: 'Project',
    bucket: (i) => i.project || NO_PROJECT,
    value: (i) => i.title.toLowerCase(),
  },
  requester: {
    label: 'Aanvrager',
    filterLabel: 'Aanvrager',
    bucket: (i) => personOf(i) || 'Onbekend',
    value: (i) => personOf(i).toLowerCase() || null,
  },
  assignee: {
    label: 'Uitvoerder',
    filterLabel: 'Uitvoerder',
    bucket: assigneeName,
    value: (i, c) => {
      const n = assigneeName(i, c);
      return n === UNASSIGNED ? null : n.toLowerCase();
    },
  },
  created: {
    label: 'Aangemaakt',
    filterLabel: 'Aangemaakt',
    bucket: (i, c) => {
      const d = days(i.created, c.tIso);
      return d <= 0 ? 'Vandaag' : d <= 7 ? 'Afgelopen 7 dagen' : d <= 30 ? 'Afgelopen 30 dagen' : 'Ouder dan 30 dagen';
    },
    order: ['Vandaag', 'Afgelopen 7 dagen', 'Afgelopen 30 dagen', 'Ouder dan 30 dagen'],
    value: (i) => i.created,
  },
  due: {
    label: 'Deadline',
    filterLabel: 'Deadline',
    bucket: (i, c) => {
      if (!i.due) return 'Geen deadline';
      if (i.due < c.tIso) return 'Verlopen';
      const nextMon = iso(addDays(monday(toDate(c.tIso)), 7));
      if (i.due < nextMon) return 'Deze week';
      if (i.due < iso(addDays(toDate(nextMon), 7))) return 'Volgende week';
      return 'Later';
    },
    order: ['Verlopen', 'Deze week', 'Volgende week', 'Later', 'Geen deadline'],
    value: (i) => i.due || null,
  },
  hours: {
    label: 'Uren',
    filterLabel: 'Uren',
    bucket: (i) => {
      const h = i.estimate != null && i.estimate > 0 ? i.estimate : 0;
      return !h ? 'Geen inschatting' : h <= 4 ? 't/m 4 uur' : h < 8 ? '4 tot 8 uur' : '8 uur of meer';
    },
    order: ['Geen inschatting', 't/m 4 uur', '4 tot 8 uur', '8 uur of meer'],
    value: (i) => (i.estimate != null && i.estimate > 0 ? i.estimate : null),
  },
};

export const COL_ORDER: ColKey[] = ['prio', 'title', 'requester', 'assignee', 'created', 'due', 'hours'];

/** Standaardrichting bij een eerste klik: datums van nieuw naar oud aflopend, de rest oplopend. */
export const DEFAULT_DIR: Record<ColKey, SortDir> = { prio: 1, title: 1, requester: 1, assignee: 1, created: -1, due: 1, hours: -1 };

export function sortItems(items: Item[], s: InboxSort, c: ColCtx): Item[] {
  const col = COLUMNS[s.key];
  const due = COLUMNS.due;
  return items.slice().sort((a, b) => {
    const va = col.value(a, c);
    const vb = col.value(b, c);
    // Lege waarden altijd onderaan, ongeacht de richting.
    if (va == null || vb == null) {
      if (va == null && vb == null) return 0;
      return va == null ? 1 : -1;
    }
    const d = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'nl');
    if (d) return d * s.dir;
    // Gelijk: op deadline, zonder deadline onderaan.
    const da = due.value(a, c);
    const db = due.value(b, c);
    return da === db ? 0 : da == null ? 1 : db == null ? -1 : String(da).localeCompare(String(db));
  });
}

export function applyColFilters(items: Item[], f: ColFilters, c: ColCtx): Item[] {
  const active = COL_ORDER.filter((k) => f[k]?.length);
  if (!active.length) return items;
  return items.filter((i) => active.every((k) => f[k]!.includes(COLUMNS[k].bucket(i, c))));
}

/** Groepen van een kolom met aantallen (op basis van de items vóór het filter van deze kolom zelf). */
export function bucketsOf(key: ColKey, items: Item[], c: ColCtx): { name: string; count: number }[] {
  const col = COLUMNS[key];
  const counts = new Map<string, number>();
  items.forEach((i) => {
    const b = col.bucket(i, c);
    counts.set(b, (counts.get(b) || 0) + 1);
  });
  const names = col.order ? col.order.filter((n) => counts.has(n)) : [...counts.keys()].sort((a, b) => a.localeCompare(b, 'nl'));
  return names.map((name) => ({ name, count: counts.get(name) || 0 }));
}
