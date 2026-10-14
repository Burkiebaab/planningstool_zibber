import type { DragEvent } from 'react';
import type { Item, SortKey } from '../lib/types';
import { Dot, NewBadge, Segmented, SoftBadge, SrcTag, WarnDot } from '../components/ui';
import { describe } from './describe';

interface Props {
  items: Item[];
  total: number;
  sort: SortKey;
  onSort: (s: SortKey) => void;
  warningsOf: (id: string) => string[];
  tIso: string;
  onSelect: (id: string) => void;
  onDragStart: (e: DragEvent, id: string) => void;
  onDragEnd: () => void;
}

const SORTS: [SortKey, string][] = [
  ['prio', 'Prioriteit'],
  ['due', 'Deadline'],
  ['created', 'Aangemaakt'],
];

export function InboxView({ items, total, sort, onSort, warningsOf, tIso, onSelect, onDragStart, onDragEnd }: Props) {
  const summary =
    items.length === total ? total + (total === 1 ? ' item' : ' items') + ' nog in te plannen' : items.length + ' van ' + total + ' items (gefilterd)';

  return (
    <div className="inbox">
      <div className="inbox-toolbar">
        <div className="muted" style={{ fontSize: 14 }}>
          {summary}
        </div>
        <div className="inbox-sort">
          <span className="muted" style={{ fontSize: 13 }}>
            Sorteer op
          </span>
          <Segmented options={SORTS} value={sort} onChange={onSort} />
        </div>
      </div>
      <div className="inbox-grid eyebrow" style={{ padding: '0 18px' }}>
        <span>Prioriteit</span>
        <span>Werkzaamheid</span>
        <span>Aanvrager</span>
        <span>Aangemaakt</span>
        <span>Deadline</span>
        <span style={{ textAlign: 'right' }}>Uren</span>
      </div>
      {items.length === 0 && (
        <div className="empty-state">
          <div className="empty-title">{total ? 'Niets gevonden' : 'Alles ingepland. Lekker bezig.'}</div>
          <div className="muted" style={{ fontSize: 14 }}>
            {total ? 'Probeer een andere zoekterm of wis de filters.' : 'Nieuwe aanvragen uit Jira verschijnen hier vanzelf.'}
          </div>
        </div>
      )}
      <div className="inbox-list">
        {items.map((i) => {
          const w = warningsOf(i.id);
          const d = describe(i, w, tIso);
          return (
            <div
              key={i.id}
              className="inbox-grid inbox-row"
              draggable
              onDragStart={(e) => onDragStart(e, i.id)}
              onDragEnd={onDragEnd}
              onClick={() => onSelect(i.id)}
            >
              <span className="inbox-prio">
                <Dot color={d.prioColor} />
                {i.priority}
              </span>
              <div className="inbox-main">
                <div className="row-gap8">
                  <span className="inbox-title ellipsis">{i.title}</span>
                  {i.isNew && <NewBadge />}
                  {d.partial && <SoftBadge>{d.partial}</SoftBadge>}
                  {w.length > 0 && <WarnDot text={d.warnText} />}
                </div>
                <div className="row-gap8 inbox-meta">
                  <SrcTag source={i.source} />
                  <span className="ellipsis">{d.meta}</span>
                </div>
              </div>
              <span className="inbox-person">
                <span className="ellipsis inbox-person-name">{d.person}</span>
                <span className="ellipsis inbox-person-dept">{d.dept}</span>
              </span>
              <span className="inbox-date">{d.created}</span>
              <span className="inbox-date" style={{ fontWeight: 600, color: d.dueColor }}>
                {d.due}
              </span>
              <span className="inbox-hours">{d.hours}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
