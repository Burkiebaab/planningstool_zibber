import { DAYS, DEPT_PERSON, PROJ_COLORS, BREAK_END, BREAK_START, WORKDAY_END, WORKDAY_START } from './constants';
import { addDays, iso, monday, toDate } from './dates';
import type { Item, Member } from './types';

export const uid = () => 'i' + Math.random().toString(36).slice(2, 9);

export const initialsOf = (n: string) =>
  String(n || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

const hash = (s: string) => {
  let h = 0;
  for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) | 0;
  return Math.abs(h);
};

export const projColor = (n: string) => PROJ_COLORS[hash(n) % PROJ_COLORS.length];

/** Naam van de aanvrager: expliciet ingevuld, anders Jira-reporter, anders (demo) afdelingshoofd. */
export const personOf = (i: Item) =>
  i.requesterName || (i.source === 'jira' ? i.reporter : '') || (i.demo ? DEPT_PERSON[i.requester] : '') || '';

export const allocSum = (i: Item) => (i.allocations || []).reduce((t, a) => t + (+a.h || 0), 0);

export const estimateOf = (i: Item) => (i.estimate != null && i.estimate > 0 ? i.estimate : 0);

export const isDone = (i: Item) => i.status === 'Klaar' || i.jiraClosed;

/** Is het blok van teamlid `mId` in week `w` afgevinkt in de weekplanning? */
export function isChecked(i: Item, mId: string, w: string): boolean {
  if (i.recurring) return (i.recurDone || []).includes(mId + '|' + w);
  return (i.allocations || []).some((a) => a.m === mId && a.w === w && a.done);
}

export const blankItem = (): Item => ({
  id: '',
  source: 'manual',
  key: '',
  project: '',
  title: '',
  type: '',
  status: 'To do',
  jiraStatus: '',
  priority: 'Normaal',
  assignee: null,
  reporter: '',
  requester: '',
  requesterName: '',
  created: iso(new Date()),
  start: '',
  due: '',
  estimate: null,
  labels: [],
  components: [],
  epic: '',
  market: 'NL',
  channel: '',
  note: '',
  recurring: '',
  isNew: false,
  jiraClosed: false,
  allocations: [],
  demo: false,
});

/** Werkdagen (zonder vrije dagen) van een teamlid in de week die begint op maandag `w`, als ISO-datums. */
function workdaysIn(m: Member, w: string): string[] {
  if (!m.workdays || !m.workdays.length) return [];
  const st = toDate(w);
  const out: string[] = [];
  for (let k = 0; k < 7; k++) {
    if (!m.workdays.includes(k + 1)) continue;
    const ds = iso(addDays(st, k));
    if ((m.vacations || []).some((v) => v.from && v.from <= ds && ds <= (v.to || v.from))) continue;
    out.push(ds);
  }
  return out;
}

/** Niet-planbaar percentage van een teamlid (0 t/m 90). */
export const reserveOf = (m: Member) => Math.min(90, Math.max(0, +(m.reserve ?? 0) || 0));

/** Contracturen per werkdag. */
const grossPerDayOf = (m: Member) => (m.workdays && m.workdays.length ? m.hours / m.workdays.length : 0);

/** Planbare uren per werkdag: contracturen min het niet-planbare deel. */
const perDayOf = (m: Member) => grossPerDayOf(m) * (1 - reserveOf(m) / 100);

/** Planbare uren per week, zonder vrije dagen. */
export const plannableHours = (m: Member) => Math.round(m.hours * (1 - reserveOf(m) / 100) * 10) / 10;

/** Beschikbare (planbare) uren van een teamlid in de week die begint op maandag `w`, rekening houdend met vrije dagen en het niet-planbare deel. */
export function capOf(m: Member, w: string): number {
  return Math.round(perDayOf(m) * workdaysIn(m, w).length * 10) / 10;
}

/** Gewerkte uren tussen het begin van de werkdag en uur `h`, zonder de pauze. */
const workedUntil = (h: number) => {
  const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
  return clamp(h, WORKDAY_START, WORKDAY_END) - WORKDAY_START - (clamp(h, BREAK_START, BREAK_END) - BREAK_START);
};

/** Deel van de beschikbare (planbare) uren in week `w` dat op moment `now` al verstreken is (werkdag van WORKDAY_START tot WORKDAY_END, zonder pauze). */
export function elapsedOf(m: Member, w: string, now: Date): number {
  const today = iso(now);
  const todayPart = workedUntil(now.getHours() + now.getMinutes() / 60) / workedUntil(WORKDAY_END);
  const days = workdaysIn(m, w).reduce((t, ds) => t + (ds < today ? 1 : ds === today ? todayPart : 0), 0);
  return Math.round(perDayOf(m) * days * 10) / 10;
}

/** Uren die een terugkerende taak in week `w` bij teamlid `mId` blokt. */
export function recurH(i: Item, w: string, mId: string): number {
  if (!i.recurring || i.assignee !== mId || isDone(i)) return 0;
  if (i.start && w < iso(monday(toDate(i.start)))) return 0;
  const h = estimateOf(i);
  if (i.recurring === 'wekelijks') return h;
  if (i.recurring === 'maandelijks') return toDate(w).getDate() <= 7 ? h : 0;
  return 0;
}

/** Staat dit item (nog deels) bij Nog inplannen? */
export function inInbox(i: Item): boolean {
  if (i.noPlanning) return false;
  if (i.recurring) return !i.assignee && i.status !== 'Klaar';
  if (isDone(i)) return false;
  return i.estimate != null && i.estimate > 0 ? allocSum(i) < i.estimate : !(i.allocations || []).length;
}

export const dayLabel = (m: Member) => {
  const d = (m.workdays || []).slice().sort();
  return d.join(',') === '1,2,3,4,5' ? 'ma t/m vr' : d.map((x) => DAYS[x - 1]).join(', ') || 'geen';
};

/** Aantal vrije dagen (vakantie e.d.) van een teamlid in week `w`. */
export const offDaysOf = (m: Member, w: string) => (m.workdays || []).filter((d) => d <= 7).length - workdaysIn(m, w).length;

export const memberInitials = (m: Member) => m.initials || initialsOf(m.name);
