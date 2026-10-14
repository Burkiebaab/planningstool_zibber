import { addDays, iso, monday, toDate, weekNo } from './dates';
import { recurH } from './planning';
import type { AppData, Member } from './types';

/** Downloadt de planning als CSV (puntkomma-gescheiden, Excel-vriendelijk). Geeft het aantal regels terug. */
export function exportPlanning(data: AppData): number {
  const byId: Record<string, Member> = {};
  data.members.forEach((m) => (byId[m.id] = m));
  const rows: (string | number)[][] = [['Bron', 'Key/ID', 'Project', 'Werkzaamheid', 'Persoon', 'Week', 'Uren']];
  const weekLabel = (w: string) => {
    const d = toDate(w);
    return addDays(d, 3).getFullYear() + '-W' + String(weekNo(d)).padStart(2, '0');
  };
  const m0 = monday(new Date());

  data.items.forEach((i) => {
    const src = i.source === 'jira' ? 'Jira' : 'Handmatig';
    const id = i.key || i.id;
    if (i.recurring) {
      if (!i.assignee) return;
      for (let k = 0; k < 8; k++) {
        const w = iso(addDays(m0, 7 * k));
        const h = recurH(i, w, i.assignee);
        if (h) rows.push([src, id, i.project, i.title, byId[i.assignee]?.name || '', weekLabel(w), h]);
      }
    } else {
      (i.allocations || []).forEach((a) => rows.push([src, id, i.project, i.title, byId[a.m]?.name || '', weekLabel(a.w), +a.h || 0]));
    }
  });

  const csv =
    '﻿' +
    rows
      .map((r) =>
        r
          .map((v) => {
            const x = typeof v === 'number' ? String(v).replace('.', ',') : String(v ?? '');
            return /[;"\n]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x;
          })
          .join(';'),
      )
      .join('\n');

  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = 'zibber-marketingplanning-' + iso(new Date()) + '.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  return rows.length - 1;
}
