import { NO_PROJECT, REQS } from './constants';
import { addDays, fmt, fmtH, iso, monday, toDate, weekNo } from './dates';
import { capOf, estimateOf, inInbox, isDone, personOf, recurH } from './planning';
import type { Allocation, AppData, Filters, Item, Member } from './types';

export type WarnTarget = { type: 'week'; offset: number } | { type: 'item'; id: string };

export interface WarnEntry {
  color: string;
  title: string;
  sub: string;
  target: WarnTarget;
}

export interface CellEntry {
  i: Item;
  a: Allocation;
}

const OVERBOOKED = 'Valt in een overboekte week';

/** Alles wat meerdere schermen nodig hebben: planning per cel, capaciteit en waarschuwingen. */
export function derive(data: AppData, weeksVisible: number) {
  const now = new Date();
  const mon0 = monday(now);
  const mon0i = iso(mon0);
  const tIso = iso(now);
  const items = data.items;

  const byId: Record<string, Member> = {};
  data.members.forEach((m) => (byId[m.id] = m));
  const active = data.members.filter((m) => !m.archived);

  const idx: Record<string, CellEntry[]> = {};
  const planned: Record<string, number> = {};
  items.forEach((i) => {
    if (i.recurring) return;
    (i.allocations || []).forEach((a) => {
      const k = a.m + '|' + a.w;
      (idx[k] = idx[k] || []).push({ i, a });
      planned[k] = (planned[k] || 0) + (+a.h || 0);
    });
  });
  const recurs = items.filter((i) => i.recurring);
  const plOf = (mId: string, w: string) => (planned[mId + '|' + w] || 0) + recurs.reduce((t, i) => t + recurH(i, w, mId), 0);

  // Overboekingen over de komende 8 weken plus alle latere weken waarin iets gepland staat.
  const horizon = new Set<string>();
  for (let k = 0; k < 8; k++) horizon.add(iso(addDays(mon0, 7 * k)));
  Object.keys(planned).forEach((k) => {
    const w = k.split('|')[1];
    if (w >= mon0i) horizon.add(w);
  });

  const over = new Set<string>();
  const warnList: WarnEntry[] = [];
  active.forEach((m) =>
    [...horizon].sort().forEach((w) => {
      const cap = capOf(m, w);
      const pl = plOf(m.id, w);
      if (pl > cap + 0.01) {
        over.add(m.id + '|' + w);
        const diff = Math.round((toDate(w).getTime() - mon0.getTime()) / 6048e5);
        warnList.push({
          color: '#D27466',
          title: m.name + ' · week ' + weekNo(toDate(w)),
          sub: 'Overboekt: ' + fmtH(pl) + 'u gepland, ' + fmtH(cap) + 'u beschikbaar',
          target: { type: 'week', offset: diff > weeksVisible - 1 ? diff - (weeksVisible - 1) : 0 },
        });
      }
    }),
  );

  const warnsOf = (i: Item) => {
    const w: string[] = [];
    const al = i.allocations || [];
    if (!isDone(i) && !(estimateOf(i) > 0)) w.push('Geen uren-inschatting');
    if (i.due && !i.recurring && al.some((a) => a.w > i.due)) w.push('Ingepland na deadline (' + fmt(i.due) + ')');
    if (i.jiraClosed && al.some((a) => a.w >= mon0i)) w.push('Jira-ticket gesloten, maar nog ingepland');
    if (!i.recurring && al.some((a) => over.has(a.m + '|' + a.w))) w.push(OVERBOOKED);
    return w;
  };
  const wmap = new Map<string, string[]>();
  items.forEach((i) => wmap.set(i.id, warnsOf(i)));
  items.forEach((i) =>
    (wmap.get(i.id) || [])
      .filter((x) => x !== OVERBOOKED)
      .forEach((x) =>
        warnList.push({ color: x.startsWith('Geen') ? '#E2B65C' : '#D27466', title: i.title, sub: x, target: { type: 'item', id: i.id } }),
      ),
  );

  const byName = (a: string, b: string) => a.localeCompare(b, 'nl');
  const reqList = [...new Set([...REQS, ...items.map((i) => i.requester).filter(Boolean)])];
  const personList = [...new Set(items.map(personOf).filter(Boolean))].sort(byName);
  // Uitvoerders om op te filteren: teamleden, en Jira-assignees die geen teamlid zijn.
  const jiraOnly = [...new Set(items.map((i) => (i.assignee && byId[i.assignee] ? '' : i.jiraAssignee || '')).filter(Boolean))].sort(byName);
  const assigneeOptions = [
    { value: UNASSIGNED, label: 'Niet toegewezen' },
    ...active
      .slice()
      .sort((a, b) => byName(a.name, b.name))
      .map((m) => ({ value: 'm:' + m.id, label: m.name })),
    ...jiraOnly.map((n) => ({ value: 'j:' + n, label: n + ' (Jira)' })),
  ];

  // Met een live Jira-koppeling zijn de epics van het marketingproject de projecten.
  const epicNames = [...new Set((data.settings.jiraEpics || []).map((e) => e.name))].sort(byName);
  const epicsActive = epicNames.length > 0;
  const inUse = items.map((i) => i.project).filter(Boolean);
  /** Keuzelijst voor het project van een taak. */
  const projectOptions = epicsActive ? [NO_PROJECT, ...epicNames] : [...new Set([...data.projects, ...inUse])].sort(byName);
  /** Projectfilter: de keuzelijst plus projecten die nog bij taken in gebruik zijn. */
  const projects = [...new Set([...projectOptions, ...inUse])].sort(byName);

  return {
    now,
    mon0,
    mon0i,
    tIso,
    byId,
    active,
    idx,
    recurs,
    plOf,
    warnList,
    warningsOf: (id: string) => wmap.get(id) || [],
    inboxAll: items.filter(inInbox),
    reqList,
    personList,
    projects,
    assigneeOptions,
    projectOptions,
    epicsActive,
    epics: data.settings.jiraEpics || [],
  };
}

export type Derived = ReturnType<typeof derive>;

export const EMPTY_FILTERS: Filters = { source: '', project: '', channel: '', market: '', requester: '', assignee: '' };

export const UNASSIGNED = '__none';

/** Uitvoerder zoals in de kolom Uitvoerder: teamlid, anders de assignee uit Jira, anders niemand. */
export function assigneeKey(i: Item, byId: Record<string, Member>) {
  if (i.assignee && byId[i.assignee]) return 'm:' + i.assignee;
  if (i.jiraAssignee) return 'j:' + i.jiraAssignee;
  return UNASSIGNED;
}

export function makeMatcher(search: string, F: Filters, byId: Record<string, Member>) {
  const q = search.trim().toLowerCase();
  return (i: Item) => {
    if (F.source && i.source !== F.source) return false;
    if (F.project && i.project !== F.project) return false;
    if (F.channel && i.channel !== F.channel) return false;
    if (F.market && i.market !== F.market && i.market !== 'Alle') return false;
    if (F.requester && personOf(i) !== F.requester) return false;
    // Op naam filteren toont ook taken waarvoor iemand is ingepland zonder uitvoerder te zijn.
    if (F.assignee && assigneeKey(i, byId) !== F.assignee && !(i.allocations || []).some((a) => 'm:' + a.m === F.assignee)) return false;
    if (q) {
      const hay = [
        i.title, i.key, i.project, i.channel, i.requester, personOf(i), i.note,
        byId[i.assignee || '']?.name,
        ...(i.allocations || []).map((a) => byId[a.m]?.name),
      ].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  };
}
