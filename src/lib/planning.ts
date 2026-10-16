import { DAYS, DEPT_PERSON, PROJ_COLORS } from './constants';
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

/** Beschikbare uren van een teamlid in de week die begint op maandag `w`, rekening houdend met vrije dagen. */
export function capOf(m: Member, w: string): number {
  if (!m.workdays || !m.workdays.length) return 0;
  const per = m.hours / m.workdays.length;
  const st = toDate(w);
  let n = 0;
  for (let k = 0; k < 7; k++) {
    if (!m.workdays.includes(k + 1)) continue;
    const ds = iso(addDays(st, k));
    if ((m.vacations || []).some((v) => v.from && v.from <= ds && ds <= (v.to || v.from))) continue;
    n++;
  }
  return Math.round(per * n * 10) / 10;
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
  if (i.recurring) return !i.assignee && i.status !== 'Klaar';
  if (isDone(i)) return false;
  return i.estimate != null && i.estimate > 0 ? allocSum(i) < i.estimate : !(i.allocations || []).length;
}

export const dayLabel = (m: Member) => {
  const d = (m.workdays || []).slice().sort();
  return d.join(',') === '1,2,3,4,5' ? 'ma t/m vr' : d.map((x) => DAYS[x - 1]).join(', ') || 'geen';
};

export const memberInitials = (m: Member) => m.initials || initialsOf(m.name);
