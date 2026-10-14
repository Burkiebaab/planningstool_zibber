import { NL_MF } from '../lib/constants';
import { addDays, fmt, iso, monday, toDate, weekNo } from '../lib/dates';
import type { Derived } from '../lib/derive';
import { isDone, projColor } from '../lib/planning';
import type { Item } from '../lib/types';

interface Props {
  dv: Derived;
  items: Item[];
  qOffset: number;
  onQOffset: (n: number) => void;
  match: (i: Item) => boolean;
  onSelect: (id: string) => void;
}

interface ProjectRow {
  kind: 'project';
  label: string;
  color: string;
  sub: string;
  bar: { left: string; width: string } | null;
}

interface ItemRow {
  kind: 'item';
  id: string;
  label: string;
  sub: string;
  bar: { left: string; width: string; planned: boolean; color: string } | null;
  due: { left: string; late: boolean; title: string } | null;
  done: boolean;
}

export function QuarterView({ dv, items, qOffset, onQOffset, match, onSelect }: Props) {
  const { now, mon0i, byId } = dv;
  const qBase = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3 + 3 * qOffset, 1);
  const qEnd = new Date(qBase.getFullYear(), qBase.getMonth() + 3, 0);
  const rs = monday(qBase);
  const re = addDays(monday(qEnd), 7);
  const span = re.getTime() - rs.getTime();
  const pc = (d: Date) => Math.max(0, Math.min(100, ((d.getTime() - rs.getTime()) / span) * 100));
  const inRange = (a: Date, b: Date) => b >= rs && a < re;

  const qWeeks: { label: string; cur: boolean }[] = [];
  for (let d = new Date(rs); d < re; d = addDays(d, 7)) qWeeks.push({ label: String(weekNo(d)), cur: iso(d) === mon0i });
  const qMonths = [0, 1, 2].map((k) => {
    const ms = new Date(qBase.getFullYear(), qBase.getMonth() + k, 1);
    const me = new Date(qBase.getFullYear(), qBase.getMonth() + k + 1, 1);
    return { label: NL_MF[ms.getMonth()], left: pc(ms) + '%', width: pc(me) - pc(ms) + '%' };
  });

  const groups: Record<string, Item[]> = {};
  items
    .filter((i) => !i.recurring && match(i))
    .forEach((i) => {
      const k = i.project || 'Zonder project';
      (groups[k] = groups[k] || []).push(i);
    });

  const rows: (ProjectRow | ItemRow)[] = [];
  Object.keys(groups)
    .sort((a, b) => a.localeCompare(b, 'nl'))
    .forEach((pn) => {
      const col = projColor(pn);
      const itemRows: { k: number; row: ItemRow }[] = [];
      let pS: Date | null = null;
      let pE: Date | null = null;

      groups[pn].forEach((i) => {
        const weeks = (i.allocations || []).map((a) => a.w).sort();
        let bS: Date | null = null;
        let bE: Date | null = null;
        let planned = false;
        if (weeks.length) {
          bS = toDate(weeks[0]);
          bE = addDays(toDate(weeks[weeks.length - 1]), 5);
          planned = true;
        } else if (i.start && i.due) {
          bS = toDate(i.start);
          bE = addDays(toDate(i.due), 1);
        }
        const dD = i.due ? toDate(i.due) : null;
        const barIn = !!(bS && bE && inRange(bS, bE));
        const dueIn = !!(dD && dD >= rs && dD < re);
        if (!barIn && !dueIn) return;
        const late = planned && !!i.due && weeks[weeks.length - 1] > i.due;

        itemRows.push({
          k: (bS || dD)!.getTime(),
          row: {
            kind: 'item',
            id: i.id,
            label: i.title,
            sub: [i.source === 'jira' ? i.key : 'Handmatig', byId[i.assignee || '']?.name || 'Niet toegewezen', planned ? '' : 'nog niet ingepland'].filter(Boolean).join(' · '),
            bar: barIn ? { left: pc(bS!) + '%', width: Math.max(0.8, pc(bE!) - pc(bS!)) + '%', planned, color: col } : null,
            due: dueIn ? { left: pc(new Date(dD!.getTime() + 432e5)) + '%', late, title: 'Deadline ' + fmt(i.due) + (late ? ' · gepland na deadline' : '') } : null,
            done: isDone(i),
          },
        });
        [bS, dD].forEach((d) => {
          if (d && (!pS || d < pS)) pS = d;
        });
        [bE, dD].forEach((d) => {
          if (d && (!pE || d > pE)) pE = d;
        });
      });

      if (!itemRows.length) return;
      const s = pS as Date | null;
      const e = pE as Date | null;
      const pIn = !!(s && e && inRange(s, e));
      rows.push({
        kind: 'project',
        label: pn,
        color: col,
        sub: itemRows.length + (itemRows.length === 1 ? ' item' : ' items'),
        bar: pIn ? { left: pc(s!) + '%', width: Math.max(0.8, pc(e!) - pc(s!)) + '%' } : null,
      });
      itemRows.sort((a, b) => a.k - b.k).forEach((r) => rows.push(r.row));
    });

  const nq = qWeeks.length;
  const gridBg = `repeating-linear-gradient(to right, transparent 0, transparent calc(${100 / nq}% - 1px), #EEF2F8 calc(${100 / nq}% - 1px), #EEF2F8 ${100 / nq}%)`;
  const todayIn = now >= rs && now < re;
  const todayLine = todayIn && <div className="today-line" style={{ left: pc(now) + '%' }} />;

  return (
    <div className="quarter">
      <div className="week-toolbar">
        <div className="row-gap6">
          <button type="button" className="icon-btn" onClick={() => onQOffset(qOffset - 1)} aria-label="Vorig kwartaal">
            ‹
          </button>
          <span className="q-label">
            Q{Math.floor(qBase.getMonth() / 3) + 1} {qBase.getFullYear()}
          </span>
          <button type="button" className="icon-btn" onClick={() => onQOffset(qOffset + 1)} aria-label="Volgend kwartaal">
            ›
          </button>
        </div>
        <div className="legend legend-q">
          <span><i className="lg-bar" style={{ background: '#8DA6CF' }} />Ingepland</span>
          <span><i className="lg-bar" style={{ border: '1.5px dashed #8DA6CF' }} />Nog niet ingepland</span>
          <span><i className="lg-diamond" style={{ background: '#1E2E4B' }} />Deadline</span>
          <span><i className="lg-diamond" style={{ background: '#D27466' }} />Gepland na deadline</span>
        </div>
      </div>

      <div className="q-board">
        <div className="q-row q-head">
          <div className="eyebrow q-head-label">Project / werkzaamheid</div>
          <div>
            <div className="q-months">
              {qMonths.map((mo) => (
                <div key={mo.label} style={{ left: mo.left, width: mo.width }}>
                  {mo.label}
                </div>
              ))}
            </div>
            <div className="q-weeks">
              {qWeeks.map((w, k) => (
                <div key={k} style={{ color: w.cur ? '#1F7FF0' : '#7A89A3', fontWeight: w.cur ? 700 : 500 }}>
                  {w.label}
                </div>
              ))}
            </div>
          </div>
        </div>

        {rows.map((r, k) =>
          r.kind === 'project' ? (
            <div key={'p' + k} className="q-row q-project">
              <div className="q-project-label">
                <span className="dot" style={{ width: 10, height: 10, borderRadius: 3, background: r.color }} />
                <span className="ellipsis" style={{ fontSize: 14, fontWeight: 700 }}>{r.label}</span>
                <span style={{ fontSize: 12, color: '#7A89A3', flexShrink: 0 }}>{r.sub}</span>
              </div>
              <div className="q-track" style={{ backgroundImage: gridBg }}>
                {todayLine}
                {r.bar && <div className="q-bar-project" style={{ left: r.bar.left, width: r.bar.width, background: r.color }} />}
              </div>
            </div>
          ) : (
            <div key={r.id} className="q-row q-item" style={{ opacity: r.done ? 0.45 : 1 }} onClick={() => onSelect(r.id)}>
              <div className="q-item-label">
                <span className="ellipsis" style={{ fontSize: 13, fontWeight: 600 }}>{r.label}</span>
                <span className="ellipsis" style={{ fontSize: 11.5, color: '#7A89A3' }}>{r.sub}</span>
              </div>
              <div className="q-track" style={{ backgroundImage: gridBg }}>
                {todayLine}
                {r.bar && (
                  <div
                    className="q-bar-item"
                    style={{ left: r.bar.left, width: r.bar.width, background: r.bar.planned ? r.bar.color + 'B3' : 'transparent', border: r.bar.planned ? 0 : '1.5px dashed ' + r.bar.color }}
                  />
                )}
                {r.due && <div className="q-due" title={r.due.title} style={{ left: r.due.left, background: r.due.late ? '#D27466' : '#1E2E4B' }} />}
              </div>
            </div>
          ),
        )}
        {rows.length === 0 && <div className="board-empty" style={{ padding: 40 }}>Geen projecten met planning of deadlines in dit kwartaal.</div>}
      </div>
    </div>
  );
}
