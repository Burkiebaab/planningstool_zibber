import type { DragEvent, MouseEvent, ReactNode } from 'react';
import { CAP_BAR, CAP_FG, CAP_LABEL, FULL_THRESHOLD, type CapState } from '../lib/constants';
import { addDays, fmt, fmtH, iso, toDate, weekNo, wkRange } from '../lib/dates';
import type { Derived } from '../lib/derive';
import { allocSum, capOf, dayLabel, estimateOf, inInbox, initialsOf, isChecked, isDone, memberInitials, projColor, recurH } from '../lib/planning';
import type { Item, Member } from '../lib/types';
import { Avatar, Dot, NewBadge, SoftBadge, WarnDot } from '../components/ui';
import { describe } from './describe';

interface Props {
  dv: Derived;
  weeksVisible: number;
  weekOffset: number;
  onWeekOffset: (n: number) => void;
  railItems: Item[];
  match: (i: Item) => boolean;
  hover: string | null;
  onHover: (key: string) => void;
  onSelect: (id: string) => void;
  onDragStart: (e: DragEvent, id: string, from: { m: string; w: string } | null) => void;
  onDragEnd: () => void;
  onDropCell: (mId: string, w: string) => void;
  onDropRail: () => void;
  onToggleCheck: (id: string, mId: string, w: string) => void;
  onMemberMenu: (e: MouseEvent, id: string) => void;
  onAddMember: () => void;
}

interface Chip {
  key: string;
  item: Item;
  hours: number;
  src: string;
  from: { m: string; w: string } | null;
  checked: boolean;
}

export function WeekView(p: Props) {
  const { dv } = p;
  const weeks = Array.from({ length: p.weeksVisible }, (_, k) => {
    const d = addDays(dv.mon0, 7 * (k + p.weekOffset));
    const cur = iso(d) === dv.mon0i;
    return { iso: iso(d), date: d, label: 'Wk ' + weekNo(d) + (cur ? ' · nu' : ''), range: wkRange(d), cur };
  });
  const todo = p.railItems.filter(inInbox).length;
  const first = weeks[0];
  const last = weeks[weeks.length - 1];

  const allowDrop = (key: string) => (e: DragEvent) => {
    e.preventDefault();
    if (p.hover !== key) p.onHover(key);
  };

  const renderCell = (m: Member, w: (typeof weeks)[number]) => {
    const cap = capOf(m, w.iso);
    const pl = dv.plOf(m.id, w.iso);
    const key = m.id + '|' + w.iso;
    const st: CapState = pl === 0 && cap === 0 ? 'off' : cap === 0 || pl > cap + 0.01 ? 'over' : pl >= cap * FULL_THRESHOLD ? 'full' : 'ok';
    const chips: Chip[] = (dv.idx[key] || []).map(({ i, a }, k) => ({
      key: i.id + k,
      item: i,
      hours: +a.h || 0,
      src: i.source === 'jira' ? 'Jira' : 'Handmatig',
      from: { m: a.m, w: a.w },
      checked: !!a.done,
    }));
    dv.recurs.forEach((i) => {
      const h = recurH(i, w.iso, m.id);
      if (h) chips.push({ key: i.id + '-r', item: i, hours: h, src: '↻ ' + (i.recurring === 'wekelijks' ? 'Wekelijks' : 'Maandelijks'), from: null, checked: isChecked(i, m.id, w.iso) });
    });
    const workdays = m.workdays.filter((d) => d <= 7).length;
    const perDay = workdays ? m.hours / workdays : 0;
    const offDays = perDay ? Math.round((m.hours - cap) / perDay) : 0;
    const pct = cap ? Math.min(100, (pl / cap) * 100) + '%' : pl ? '100%' : '0%';

    return (
      <div
        key={key}
        className="week-cell"
        style={{ background: p.hover === key ? '#EAF2FE' : st === 'off' ? '#FAFBFD' : '#FFFFFF' }}
        onDragOver={allowDrop(key)}
        onDrop={(e) => {
          e.preventDefault();
          p.onDropCell(m.id, w.iso);
        }}
      >
        <div className="cap">
          <div className="cap-label">
            <span>
              {fmtH(pl)} / {fmtH(cap)}u
            </span>
            <span style={{ color: CAP_FG[st] }}>{CAP_LABEL[st]}</span>
          </div>
          <div className="bar">
            <div style={{ width: pct, background: CAP_BAR[st] }} />
          </div>
          {offDays > 0 && <span className="cap-note">{offDays + (offDays === 1 ? ' vrije dag' : ' vrije dagen')}</span>}
        </div>
        {chips.map((c) => {
          const warn = c.from ? dv.warningsOf(c.item.id) : [];
          const closed = isDone(c.item);
          const done = closed || c.checked;
          return (
            <div
              key={c.key}
              className={'chip' + (done ? ' chip-done' : '')}
              draggable={!!c.from}
              style={{ opacity: p.match(c.item) ? 1 : 0.28 }}
              onDragStart={(e) => (c.from ? p.onDragStart(e, c.item.id, c.from) : e.preventDefault())}
              onDragEnd={p.onDragEnd}
              onClick={() => p.onSelect(c.item.id)}
            >
              <div className="chip-head">
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={done}
                  className={'chip-check' + (done ? ' on' : '')}
                  style={{ borderColor: done ? undefined : projColor(c.item.project) }}
                  disabled={closed}
                  title={closed ? 'Afgerond (status Klaar of gesloten in Jira)' : done ? 'Afgevinkt. Klik om weer open te zetten.' : 'Afvinken als gedaan (alleen in de planning, niet in Jira)'}
                  onClick={(e) => {
                    e.stopPropagation();
                    p.onToggleCheck(c.item.id, m.id, w.iso);
                  }}
                >
                  {done ? '✓' : ''}
                </button>
                <span className="clamp2 chip-title">{c.item.title}</span>
              </div>
              <div className="chip-meta">
                <strong>{fmtH(c.hours)}u</strong>
                <span>{c.src}</span>
                {warn.length > 0 && <WarnDot text={warn.join(' · ')} size={14} />}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="week-layout">
      <div className="rail" style={{ background: p.hover === 'rail' ? '#DCE8FB' : '#ECF2FD' }} onDragOver={allowDrop('rail')} onDrop={(e) => {
        e.preventDefault();
        p.onDropRail();
      }}>
        <div className="rail-head">
          <span>Alle taken</span>
          <span className="rail-count">{p.railItems.length}</span>
        </div>
        <span className="rail-hint">
          {todo ? todo + ' nog in te plannen. ' : 'Alles is ingepland. '}
          Sleep een taak naar een teamlid en week, ook als hij al is ingepland. Sleep een blok terug om het uit die week te halen.
        </span>
        {p.railItems.length === 0 && <div className="rail-empty">Geen openstaande taken.</div>}
        {p.railItems.map((i) => {
          const w = dv.warningsOf(i.id);
          const d = describe(i, w, dv.tIso);
          const st = planState(i, dv.byId);
          return (
            <div key={i.id} className="rail-card" draggable onDragStart={(e) => p.onDragStart(e, i.id, null)} onDragEnd={p.onDragEnd} onClick={() => p.onSelect(i.id)}>
              <div className="rail-card-head">
                <Dot color={d.prioColor} style={{ marginTop: 5 }} />
                <span className="clamp2">{i.title}</span>
                <AssigneeBadge item={i} byId={dv.byId} />
              </div>
              <div className="rail-card-meta">
                <span className="src-tag src-tag-sm">{i.source === 'jira' ? 'Jira' : 'Handmatig'}</span>
                <strong>{d.hours}</strong>
                <span style={{ color: d.dueColor }}>{d.due}</span>
                {i.isNew && <NewBadge small />}
                {d.partial && <SoftBadge small>{d.partial}</SoftBadge>}
                {st && (
                  <span className="badge badge-sm badge-ok" title={st.title}>
                    {st.label}
                  </span>
                )}
                {w.length > 0 && <WarnDot text={d.warnText} size={16} />}
              </div>
            </div>
          );
        })}
      </div>

      <div className="week-main">
        <div className="week-toolbar">
          <div className="row-gap6">
            <button type="button" className="icon-btn" onClick={() => p.onWeekOffset(p.weekOffset - 1)} aria-label="Vorige week">
              ‹
            </button>
            <button type="button" className="btn btn-sm" onClick={() => p.onWeekOffset(0)}>
              Deze week
            </button>
            <button type="button" className="icon-btn" onClick={() => p.onWeekOffset(p.weekOffset + 1)} aria-label="Volgende week">
              ›
            </button>
            <span className="muted" style={{ fontSize: 13, marginLeft: 8 }}>
              Week {weekNo(toDate(first.iso))} – {weekNo(toDate(last.iso))} · {fmt(first.iso)} – {fmt(addDays(toDate(last.iso), 4))}
            </span>
          </div>
          <div className="legend">
            <span><i style={{ background: CAP_BAR.ok }} />Ruimte</span>
            <span><i style={{ background: CAP_BAR.full }} />Vol</span>
            <span><i style={{ background: CAP_BAR.over }} />Overboekt</span>
          </div>
        </div>

        <div className="week-board">
          <div className="week-grid" style={{ gridTemplateColumns: `210px repeat(${p.weeksVisible}, minmax(180px, 1fr))`, minWidth: 210 + 180 * p.weeksVisible }}>
            <div className="week-corner eyebrow">Team</div>
            {weeks.map((w) => (
              <div key={w.iso} className="week-head" style={{ background: w.cur ? '#EEF4FE' : '#F7F9FD' }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: w.cur ? '#1F7FF0' : '#1E2E4B' }}>{w.label}</span>
                <span className="muted" style={{ fontSize: 12 }}>{w.range}</span>
              </div>
            ))}
            {dv.active.map((m) => (
              <MemberRow key={m.id} m={m} onMenu={(e) => p.onMemberMenu(e, m.id)}>
                {weeks.map((w) => renderCell(m, w))}
              </MemberRow>
            ))}
          </div>
          {dv.active.length === 0 && <div className="board-empty">Nog geen teamleden. Voeg je eerste collega toe.</div>}
          <div className="board-foot">
            <button type="button" className="btn-dashed" onClick={p.onAddMember}>
              + Teamlid
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MemberRow({ m, onMenu, children }: { m: Member; onMenu: (e: MouseEvent) => void; children: ReactNode }) {
  return (
    <>
      <div className="week-member">
        <Avatar color={m.color} initials={memberInitials(m)} size={34} fontSize={12.5} />
        <div className="week-member-info">
          <span className="ellipsis" style={{ fontSize: 14, fontWeight: 700 }}>{m.name}</span>
          <span className="ellipsis muted" style={{ fontSize: 12 }}>{m.role || '—'}</span>
          <span style={{ fontSize: 11.5, color: '#7A89A3' }}>{fmtH(m.hours)}u/week · {dayLabel(m)}</span>
          {m.type === 'extern' && <span className="badge badge-soft badge-sm" style={{ alignSelf: 'flex-start', marginTop: 2 }}>Extern</span>}
        </div>
        <button type="button" className="more-btn" title="Opties" onClick={onMenu}>
          ⋯
        </button>
      </div>
      {children}
    </>
  );
}

/** Kleine initialen van de uitvoerder: teamlid in eigen kleur, Jira-assignee in grijs, anders niets. */
function AssigneeBadge({ item, byId }: { item: Item; byId: Record<string, Member> }) {
  const m = byId[item.assignee || ''];
  const name = m ? m.name : item.jiraAssignee;
  if (!name) return null;
  return (
    <span className="rail-assignee" title={'Uitvoerder: ' + name + (m ? '' : ' (Jira)')}>
      <Avatar color={m ? m.color : '#9AA8BF'} initials={m ? memberInitials(m) : initialsOf(name)} size={20} fontSize={9} />
    </span>
  );
}

/** Planningsstatus van een taak in de lijst: volledig ingepland of afgevinkt, met wie wanneer. */
function planState(i: Item, byId: Record<string, Member>): { label: string; title: string } | null {
  const al = i.allocations || [];
  if (i.recurring || !al.length || inInbox(i)) return null;
  const title =
    'Ingepland: ' +
    al.map((a) => (byId[a.m]?.name || 'onbekend') + ' ' + fmtH(+a.h || 0) + 'u (wk ' + weekNo(toDate(a.w)) + (a.done ? ', afgevinkt' : '') + ')').join(', ');
  if (al.every((a) => a.done)) return { label: '✓ Afgevinkt', title };
  const est = estimateOf(i);
  return { label: 'Ingepland' + (est ? ' ' + fmtH(allocSum(i)) + 'u' : ''), title };
}
