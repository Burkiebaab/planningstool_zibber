import { useEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent } from 'react';
import { DeleteModal } from './components/DeleteModal';
import { Header } from './components/Header';
import { ItemPanel } from './components/ItemPanel';
import { MemberModal } from './components/MemberModal';
import { SettingsModal } from './components/SettingsModal';
import { Sidebar, VIEWS } from './components/Sidebar';
import { TaskModal } from './components/TaskModal';
import type { Opt } from './components/ui';
import { PRIO, STORAGE_KEY, WEEKS_VISIBLE } from './lib/constants';
import { addDays, fmt, iso, weekNo } from './lib/dates';
import { derive, EMPTY_FILTERS, makeMatcher, type WarnEntry } from './lib/derive';
import { usePlanning, useToast, type TaskForm } from './lib/store';
import type { DragInfo, Filters, Item, SortKey, View } from './lib/types';
import { InboxView } from './views/InboxView';
import { QuarterView } from './views/QuarterView';
import { TeamView } from './views/TeamView';
import { WeekView } from './views/WeekView';

const VIEW_KEY = STORAGE_KEY + '-view';

const SUBS: Record<View, string> = {
  inbox: 'Alles wat nog ingepland moet worden, uit Jira en handmatig.',
  week: 'Sleep items naar een teamlid en week. De balk laat zien hoeveel ruimte er nog is.',
  quarter: 'Projecten, epics en deadlines op een tijdlijn.',
  team: 'Beheer je team, beschikbaarheid en vaste taken.',
};

const byDue = (a: Item, b: Item) => ((a.due || '9999') < (b.due || '9999') ? -1 : (a.due || '9999') > (b.due || '9999') ? 1 : 0);
const SORTERS: Record<SortKey, (a: Item, b: Item) => number> = {
  prio: (a, b) => PRIO[a.priority] - PRIO[b.priority] || ((a.due || '9999') < (b.due || '9999') ? -1 : 1),
  due: (a, b) => byDue(a, b) || PRIO[a.priority] - PRIO[b.priority],
  created: (a, b) => (a.created < b.created ? 1 : -1),
};

type ModalState =
  | null
  | { kind: 'task'; preset?: Partial<TaskForm> }
  | { kind: 'member'; id: string | null }
  | { kind: 'delete'; id: string }
  | { kind: 'settings' };

function loadView(): View {
  try {
    const v = localStorage.getItem(VIEW_KEY) as View | null;
    if (v && VIEWS.some(([k]) => k === v)) return v;
  } catch {
    /* geen opslag beschikbaar */
  }
  return 'week';
}

export default function App() {
  const [toast, showToast] = useToast();
  const pl = usePlanning(showToast);
  const { data } = pl;

  const [view, setView] = useState<View>(loadView);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [sort, setSort] = useState<SortKey>('prio');
  const [weekOffset, setWeekOffset] = useState(0);
  const [qOffset, setQOffset] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState>(null);
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [warnOpen, setWarnOpen] = useState(false);
  const [hover, setHover] = useState<string | null>(null);
  const drag = useRef<DragInfo | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_KEY, view);
    } catch {
      /* negeren */
    }
  }, [view]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setSelected(null);
      setModal(null);
      setMenu(null);
      setWarnOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const dv = useMemo(() => derive(data, WEEKS_VISIBLE), [data]);
  const match = useMemo(() => makeMatcher(search, filters, dv.byId), [search, filters, dv.byId]);
  const inboxFiltered = useMemo(() => dv.inboxAll.filter(match).sort(SORTERS[sort]), [dv.inboxAll, match, sort]);

  const weekOpts: Opt[] = useMemo(() => {
    const out: Opt[] = [];
    for (let k = -8; k <= 26; k++) {
      const d = addDays(dv.mon0, 7 * k);
      out.push({ value: iso(d), label: 'Wk ' + weekNo(d) + ' · ' + fmt(d) });
    }
    return out;
  }, [dv.mon0]);

  // ── Slepen ──
  const onDragStart = (e: DragEvent, id: string, from: DragInfo['from'] = null) => {
    drag.current = { id, from };
    try {
      e.dataTransfer.setData('text/plain', id);
      e.dataTransfer.effectAllowed = 'move';
    } catch {
      /* sommige browsers staan dit niet toe */
    }
  };
  const onDragEnd = () => {
    drag.current = null;
    setHover(null);
  };
  const takeDrag = () => {
    const d = drag.current;
    drag.current = null;
    setHover(null);
    return d;
  };

  const openMenu = (e: MouseEvent, id: string) => {
    e.stopPropagation();
    const r = e.currentTarget.getBoundingClientRect();
    setMenu((m) => (m && m.id === id ? null : { id, x: r.right, y: r.bottom }));
  };

  const onWarn = (w: WarnEntry) => {
    setWarnOpen(false);
    if (w.target.type === 'week') {
      setView('week');
      setWeekOffset(w.target.offset);
    } else setSelected(w.target.id);
  };

  const sel = selected ? data.items.find((i) => i.id === selected) : undefined;
  const menuMember = menu ? dv.byId[menu.id] : undefined;
  const closeModal = () => setModal(null);
  const viewTitle = (VIEWS.find(([k]) => k === view) || VIEWS[1])[1];

  return (
    <div className="app">
      <Sidebar
        view={view}
        onView={setView}
        inboxCount={dv.inboxAll.length}
        settings={data.settings}
        lastSync={data.lastSync}
        syncing={pl.syncing}
        onSync={() => pl.sync(true)}
        onSettings={() => setModal({ kind: 'settings' })}
      />

      <main className="main">
        <Header
          title={viewTitle}
          sub={SUBS[view]}
          warnList={dv.warnList}
          warnOpen={warnOpen}
          onToggleWarn={() => setWarnOpen(!warnOpen)}
          onWarn={onWarn}
          onExport={pl.exportCsv}
          onNewTask={() => setModal({ kind: 'task' })}
          search={search}
          onSearch={setSearch}
          filters={filters}
          onFilter={(k, v) => setFilters((f) => ({ ...f, [k]: v }))}
          onClear={() => {
            setSearch('');
            setFilters(EMPTY_FILTERS);
          }}
          projects={dv.projects}
          persons={dv.personList}
        />

        <div className="content">
          {view === 'inbox' && (
            <InboxView
              items={inboxFiltered}
              total={dv.inboxAll.length}
              sort={sort}
              onSort={setSort}
              warningsOf={dv.warningsOf}
              tIso={dv.tIso}
              onSelect={setSelected}
              onDragStart={(e, id) => onDragStart(e, id)}
              onDragEnd={onDragEnd}
            />
          )}
          {view === 'week' && (
            <WeekView
              dv={dv}
              weeksVisible={WEEKS_VISIBLE}
              weekOffset={weekOffset}
              onWeekOffset={setWeekOffset}
              railItems={inboxFiltered}
              match={match}
              hover={hover}
              onHover={setHover}
              onSelect={setSelected}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onDropCell={(mId, w) => {
                const d = takeDrag();
                if (d) pl.dropOn(d, mId, w);
              }}
              onDropRail={() => {
                const d = takeDrag();
                if (d) pl.dropOnRail(d);
              }}
              onMemberMenu={openMenu}
              onAddMember={() => setModal({ kind: 'member', id: null })}
            />
          )}
          {view === 'quarter' && <QuarterView dv={dv} items={data.items} qOffset={qOffset} onQOffset={setQOffset} match={match} onSelect={setSelected} />}
          {view === 'team' && (
            <TeamView
              dv={dv}
              members={data.members}
              demoCount={data.items.filter((i) => i.demo).length}
              onAddMember={() => setModal({ kind: 'member', id: null })}
              onEditMember={(id) => setModal({ kind: 'member', id })}
              onMemberMenu={openMenu}
              onRestore={pl.toggleArchive}
              onDelete={(id) => setModal({ kind: 'delete', id })}
              onAddRecurring={() => setModal({ kind: 'task', preset: { recurring: 'wekelijks' } })}
              onSelect={setSelected}
              onClearDemo={() => {
                pl.clearDemo();
                setSelected(null);
              }}
              onLoadDemo={pl.loadDemo}
            />
          )}
        </div>
      </main>

      {warnOpen && <div className="click-away" style={{ zIndex: 44 }} onClick={() => setWarnOpen(false)} />}

      {sel && <ItemPanel key={sel.id} item={sel} dv={dv} site={data.settings.site} weekOpts={weekOpts} pl={pl} onClose={() => setSelected(null)} />}

      {modal?.kind === 'task' && <TaskModal preset={modal.preset} dv={dv} weekOpts={weekOpts} onSave={pl.saveTask} onClose={closeModal} />}
      {modal?.kind === 'member' && (
        <MemberModal member={modal.id ? dv.byId[modal.id] || null : null} memberCount={data.members.length} onSave={pl.saveMember} onClose={closeModal} />
      )}
      {modal?.kind === 'delete' && dv.byId[modal.id] && (
        <DeleteModal
          member={dv.byId[modal.id]}
          others={dv.active.filter((m) => m.id !== modal.id)}
          items={data.items}
          onConfirm={(to) => pl.deleteMember(modal.id, to)}
          onClose={closeModal}
        />
      )}
      {modal?.kind === 'settings' && (
        <SettingsModal
          settings={data.settings}
          lastSync={data.lastSync}
          syncing={pl.syncing}
          onSync={() => pl.sync(true)}
          onSetting={pl.setSetting}
          onImport={pl.importCsv}
          onClose={closeModal}
        />
      )}

      {menuMember && menu && (
        <>
          <div className="click-away" style={{ zIndex: 70 }} onClick={() => setMenu(null)} />
          <div className="menu" style={{ left: Math.max(8, menu.x - 180), top: Math.min(menu.y + 6, window.innerHeight - 150) }}>
            <button
              type="button"
              onClick={() => {
                setMenu(null);
                setModal({ kind: 'member', id: menuMember.id });
              }}
            >
              Bewerken
            </button>
            <button
              type="button"
              onClick={() => {
                setMenu(null);
                pl.toggleArchive(menuMember.id);
              }}
            >
              {menuMember.archived ? 'Terugzetten' : 'Archiveren'}
            </button>
            <button
              type="button"
              className="danger"
              onClick={() => {
                setMenu(null);
                setModal({ kind: 'delete', id: menuMember.id });
              }}
            >
              Verwijderen
            </button>
          </div>
        </>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
