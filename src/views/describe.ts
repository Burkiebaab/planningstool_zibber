import { PCOL } from '../lib/constants';
import { fmt, fmtH } from '../lib/dates';
import { allocSum, estimateOf, personOf } from '../lib/planning';
import type { Item } from '../lib/types';

/** Weergavevelden voor een item in de inbox en de inbox-rail van de weekplanning. */
export function describe(i: Item, warnings: string[], tIso: string) {
  const sum = allocSum(i);
  const est = estimateOf(i);
  return {
    meta: [i.key, i.project, i.channel, i.market].filter(Boolean).join(' · '),
    person: personOf(i) || 'Onbekend',
    dept: i.requester || 'Geen afdeling',
    created: fmt(i.created),
    due: i.due ? fmt(i.due) : 'Geen deadline',
    dueColor: i.due && i.due < tIso ? '#B5493C' : '#3A4A66',
    hours: est ? fmtH(est) + 'u' : '? u',
    partial: sum > 0 && sum < est ? 'nog ' + fmtH(est - sum) + 'u' : '',
    warnText: warnings.join(' · '),
    prioColor: PCOL[i.priority] || PCOL.Normaal,
  };
}
