import type { Priority, Status } from './types';

export const STORAGE_KEY = 'zibber-planning-v1';

/** Project van een taak die (nog) onder geen epic valt. */
export const NO_PROJECT = 'Zonder project';

/** Aantal weken dat de weekplanning tegelijk toont (1–4). */
export const WEEKS_VISIBLE = 4;
/** Vanaf welk percentage van de capaciteit een week als "vol" geldt. */
export const FULL_THRESHOLD = 0.85;

export const NL_M = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
export const NL_MF = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];
export const DAYS = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'];

export const PRIO: Record<Priority, number> = { Hoog: 0, Normaal: 1, Laag: 2 };
export const PRIORITIES: Priority[] = ['Hoog', 'Normaal', 'Laag'];
export const PCOL: Record<Priority, string> = { Hoog: '#D27466', Normaal: '#8FA3C4', Laag: '#C9D3E3' };

export const CHANNELS = ['e-mail', 'LinkedIn', 'website', 'SEO', 'events', 'sales-support', 'content'];
export const MARKETS = ['NL', 'BE', 'DE', 'Alle'];
export const REQS = ['Sales', 'Customer Relations', 'Directie', 'Marketing', 'Product'];
export const STATUSES: Status[] = ['To do', 'Bezig', 'Review', 'Klaar'];

export const COLORS = ['#2E9C8F', '#4F6FD8', '#C27A3A', '#8E6CC9', '#C95F7E', '#5E8A3C', '#3D8FB8', '#7A7F8C'];
export const PROJ_COLORS = ['#5B7FD6', '#3FA191', '#D08B4A', '#9B7BD0', '#D06F8C', '#6E9A4A', '#4A9CC4', '#B5934A'];

export const DEPT_PERSON: Record<string, string> = {
  Marketing: 'Wouter Priest',
  Sales: 'Sanne de Wit',
  'Customer Relations': 'Lotte Janssen',
  Directie: 'Daan Verhoef',
  Product: 'Jonas Becker',
};

export const STATUS_TO_JIRA: Record<Status, string> = { 'To do': 'To Do', Bezig: 'In Progress', Review: 'In Review', Klaar: 'Done' };
export const PRIO_TO_JIRA: Record<Priority, string> = { Hoog: 'High', Normaal: 'Medium', Laag: 'Low' };

/** Kleuren van de capaciteitsstatus: ruimte, vol, overboekt, afwezig. */
export type CapState = 'ok' | 'full' | 'over' | 'off';
export const CAP_BAR: Record<CapState, string> = { off: '#C9D3E3', over: '#D98073', full: '#E2B65C', ok: '#86C3A3' };
export const CAP_FG: Record<CapState, string> = { off: '#7A89A3', over: '#B5493C', full: '#9A6F17', ok: '#3F8A63' };
export const CAP_LABEL: Record<CapState, string> = { off: 'Afwezig', over: 'Overboekt', full: 'Vol', ok: 'Ruimte' };
