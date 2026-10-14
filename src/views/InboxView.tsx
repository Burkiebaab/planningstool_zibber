import { useEffect, useState, type DragEvent, type MouseEvent } from 'react';
import { applyColFilters, bucketsOf, COL_ORDER, COLUMNS, DEFAULT_DIR, type ColFilters, type ColKey, type InboxSort } from '../lib/inboxColumns';
import type { Item, Member } from '../lib/types';
import { Assignee } from '../components/Assignee';
import { Dot, NewBadge, Segmented, SoftBadge, SrcTag, WarnDot } from '../components/ui';
import { describe } from './describe';

interface Props {
  items: Item[];
  total: number;
  sort: InboxSort;
  onSort: (s: InboxSort) => void;
  colFilters: ColFilters;
  onColFilters: (f: ColFilters) => void;
  warningsOf: (id: string) => string[];
  byId: Record<string, Member>;
  tIso: string;
  onSelect: (id: string) => void;
  onDragStart: (e: DragEvent, id: string) => void;
  onDragEnd: () => void;
}

const SORTS: [ColKey, string][] = [
  ['prio', 'Prioriteit'],
  ['due', 'Deadline'],
  ['created', 'Aangemaakt'],
];

export function InboxView({ items: all, total, sort, onSort, colFilters, onColFilters, warningsOf, byId, tIso, onSelect, onDragStart, onDragEnd }: Props) {
  const ctx = { byId, tIso };
  const items = applyColFilters(all, colFilters, ctx);
  const colFiltersOn = COL_ORDER.some((k) => colFilters[k]?.length);
  const [menu, setMenu] = useState<{ key: ColKey; left: number; top: number } | null>(null);
  const summary =
    items.length === total ? total + (total === 1 ? ' item' : ' items') + ' nog in te plannen' : items.length + ' van ' + total + ' items (gefilterd)';

  // Kolommenu sluiten bij Escape of scrollen (het staat vast op het scherm).
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', close, true);
    };
  }, [menu]);

  const openMenu = (e: MouseEvent, key: ColKey) => {
    const r = e.currentTarget.getBoundingClientRect();
    setMenu(menu?.key === key ? null : { key, left: Math.min(r.left, window.innerWidth - 270), top: r.bottom + 6 });
  };

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
          <Segmented options={SORTS} value={sort.key} onChange={(key) => onSort({ key, dir: DEFAULT_DIR[key] })} />
        </div>
      </div>
      {colFiltersOn && (
        <div className="col-filter-bar">
          <span>Kolomfilter actief:</span>
          {COL_ORDER.filter((k) => colFilters[k]?.length).map((k) => (
            <span key={k} className="col-filter-chip">
              {COLUMNS[k].label}: {colFilters[k]!.join(', ')}
            </span>
          ))}
          <button type="button" className="link-btn" onClick={() => onColFilters({})}>
            Kolomfilters wissen
          </button>
        </div>
      )}
      <div className="inbox-grid eyebrow" style={{ padding: '0 18px' }}>
        {COL_ORDER.map((k) => {
          const filtered = !!colFilters[k]?.length;
          const sorted = sort.key === k;
          return (
            <button
              key={k}
              type="button"
              className={'col-head' + (filtered || sorted ? ' active' : '') + (k === 'hours' ? ' col-head-right' : '')}
              onClick={(e) => openMenu(e, k)}
              aria-haspopup="menu"
              aria-expanded={menu?.key === k}
            >
              {COLUMNS[k].label}
              {sorted && <span className="col-sort">{sort.dir === 1 ? '↑' : '↓'}</span>}
              {filtered && <span className="col-filter-dot" />}
              <span className="col-caret">▾</span>
            </button>
          );
        })}
      </div>
      {menu && (
        <ColumnMenu
          k={menu.key}
          left={menu.left}
          top={menu.top}
          sort={sort}
          onSort={(s) => {
            onSort(s);
            setMenu(null);
          }}
          selected={colFilters[menu.key] || []}
          onSelected={(sel) => onColFilters({ ...colFilters, [menu.key]: sel })}
          buckets={bucketsOf(menu.key, applyColFilters(all, { ...colFilters, [menu.key]: [] }, ctx), ctx)}
          onClose={() => setMenu(null)}
        />
      )}
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
              <Assignee member={byId[i.assignee || '']} jiraName={i.jiraAssignee} />
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

function ColumnMenu(p: {
  k: ColKey;
  left: number;
  top: number;
  sort: InboxSort;
  onSort: (s: InboxSort) => void;
  selected: string[];
  onSelected: (sel: string[]) => void;
  buckets: { name: string; count: number }[];
  onClose: () => void;
}) {
  const col = COLUMNS[p.k];
  const toggle = (name: string) => p.onSelected(p.selected.includes(name) ? p.selected.filter((x) => x !== name) : [...p.selected, name]);
  const isSorted = (dir: 1 | -1) => p.sort.key === p.k && p.sort.dir === dir;
  return (
    <>
      <div className="click-away" style={{ zIndex: 46 }} onClick={p.onClose} />
      <div className="col-menu" style={{ left: p.left, top: p.top }} role="menu">
        <div className="col-menu-section">
          <span className="col-menu-title">Sorteren</span>
          <div className="row-gap6">
            <button type="button" className={'col-menu-sort' + (isSorted(1) ? ' on' : '')} onClick={() => p.onSort({ key: p.k, dir: 1 })}>
              ↑ Oplopend
            </button>
            <button type="button" className={'col-menu-sort' + (isSorted(-1) ? ' on' : '')} onClick={() => p.onSort({ key: p.k, dir: -1 })}>
              ↓ Aflopend
            </button>
          </div>
        </div>
        <div className="col-menu-section">
          <span className="col-menu-title">Filter op {col.filterLabel.toLowerCase()}</span>
          <div className="col-menu-list">
            {p.buckets.length === 0 && <span className="muted" style={{ fontSize: 12.5 }}>Geen waarden.</span>}
            {p.buckets.map((b) => (
              <label key={b.name} className="col-menu-option">
                <input type="checkbox" checked={p.selected.includes(b.name)} onChange={() => toggle(b.name)} />
                <span className="ellipsis">{b.name}</span>
                <span className="col-menu-count">{b.count}</span>
              </label>
            ))}
            {/* Een eerder gekozen waarde die nu niet (meer) voorkomt, blijft zichtbaar zodat je hem kunt uitvinken. */}
            {p.selected
              .filter((n) => !p.buckets.some((b) => b.name === n))
              .map((n) => (
                <label key={n} className="col-menu-option">
                  <input type="checkbox" checked onChange={() => toggle(n)} />
                  <span className="ellipsis">{n}</span>
                  <span className="col-menu-count">0</span>
                </label>
              ))}
          </div>
        </div>
        <div className="col-menu-foot">
          <button type="button" className="link-btn" style={{ padding: 0 }} disabled={!p.selected.length} onClick={() => p.onSelected([])}>
            Filter wissen
          </button>
          <button type="button" className="btn btn-sm" onClick={p.onClose}>
            Klaar
          </button>
        </div>
      </div>
    </>
  );
}
