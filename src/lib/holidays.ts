import { addDays, iso } from './dates';

export interface Holiday {
  /** ISO-datum (yyyy-mm-dd). */
  date: string;
  name: string;
}

/** Paaszondag (gregoriaanse kalender, algoritme van Meeus/Jones/Butcher). */
function easter(y: number): Date {
  const a = y % 19;
  const b = Math.floor(y / 100);
  const c = y % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(y, month - 1, day);
}

const cache: Record<number, Holiday[]> = {};

/**
 * Nederlandse feestdagen waarop het hele team (intern en extern) vrij is.
 * Niet: Goede Vrijdag en Bevrijdingsdag. 1e Paasdag en 1e Pinksterdag vallen op zondag en tellen dus niet mee.
 */
export function holidaysOf(y: number): Holiday[] {
  if (cache[y]) return cache[y];
  const e = easter(y);
  // Koningsdag schuift naar zaterdag 26 april als 27 april op zondag valt.
  const king = new Date(y, 3, 27);
  const list: [Date, string][] = [
    [new Date(y, 0, 1), 'Nieuwjaarsdag'],
    [addDays(e, 1), '2e Paasdag'],
    [king.getDay() === 0 ? new Date(y, 3, 26) : king, 'Koningsdag'],
    [addDays(e, 39), 'Hemelvaartsdag'],
    [addDays(e, 50), '2e Pinksterdag'],
    [new Date(y, 11, 25), '1e Kerstdag'],
    [new Date(y, 11, 26), '2e Kerstdag'],
  ];
  return (cache[y] = list.map(([d, name]) => ({ date: iso(d), name })));
}

/** Feestdag op deze ISO-datum, of undefined. */
export const holidayOn = (ds: string): Holiday | undefined => holidaysOf(+ds.slice(0, 4)).find((h) => h.date === ds);
