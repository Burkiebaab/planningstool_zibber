import { NL_M } from './constants';

const z = (n: number) => String(n).padStart(2, '0');

export const iso = (d: Date) => `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;

/** Leest een ISO-datum (yyyy-mm-dd) als lokale datum. */
export const toDate = (s: string) => {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
};

export const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

export const monday = (d: Date) => {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return addDays(x, -((x.getDay() + 6) % 7));
};

/** ISO-weeknummer. */
export const weekNo = (d: Date) => {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t.getTime() - y0.getTime()) / 864e5 + 1) / 7);
};

/** "14 okt" */
export const fmt = (s: string | Date | null | undefined) => {
  if (!s) return '—';
  const d = typeof s === 'string' ? toDate(s) : s;
  return d.getDate() + ' ' + NL_M[d.getMonth()];
};

/** Uren met Nederlandse komma: 1.5 → "1,5" */
export const fmtH = (h: number | string | null | undefined) => {
  const v = Math.round((+(h ?? 0) || 0) * 10) / 10;
  return Number.isInteger(v) ? String(v) : String(v).replace('.', ',');
};

/** "13–17 okt" of "29 sep – 3 okt" */
export const wkRange = (d: Date) => {
  const e = addDays(d, 4);
  return d.getMonth() === e.getMonth() ? `${d.getDate()}–${e.getDate()} ${NL_M[e.getMonth()]}` : `${fmt(d)} – ${fmt(e)}`;
};

export const hhmm = (d: Date) => `${z(d.getHours())}:${z(d.getMinutes())}`;
