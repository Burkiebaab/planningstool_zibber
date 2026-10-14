import { useCallback, useEffect, useRef, useState } from 'react';
import { STATUS_TO_JIRA, STORAGE_KEY } from './constants';
import { addDays, fmtH, iso, monday, toDate, weekNo } from './dates';
import { buildDemo, demoPool, freshData, migrateSettings } from './demo';
import { exportPlanning } from './exportCsv';
import { csvToIssues, mergeIssues, toIssue } from './jira';
import { allocSum, blankItem, estimateOf, initialsOf, uid } from './planning';
import { fetchLiveIssues, pushEstimate } from './jiraLive';
import { useRemoteSync } from './remoteSync';
import type { Allocation, AppData, DragInfo, Item, Member, Priority, Recurring, Settings, Status } from './types';

export interface TaskForm {
  project: string;
  newProject: string;
  title: string;
  estimate: string;
  assignee: string;
  week: string;
  start: string;
  due: string;
  priority: Priority;
  market: string;
  channel: string;
  requester: string;
  requesterName: string;
  status: Status;
  recurring: Recurring;
  note: string;
}

export type TaskErrors = Partial<Record<'project' | 'title' | 'estimate', string>>;

export interface MemberForm extends Omit<Member, 'id' | 'hours'> {
  id: string | null;
  hours: number | '';
}

/** Planning uit deze browser, of null als er niets (geldigs) staat. */
export function readLocal(): AppData | null {
  try {
    const d = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (d && d.members && d.items) return { ...d, settings: migrateSettings(d.settings || {}) };
  } catch {
    /* lege of kapotte opslag */
  }
  return null;
}

/** Startdata voor de lokale modus: wat in de browser staat, anders demo-data. */
export const loadLocal = (): AppData => readLocal() || freshData();

function save(d: AppData) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(d));
  } catch {
    /* opslag vol of geblokkeerd */
  }
}

/** Stand van de Jira-koppeling: live, gesimuleerd (demo), niet gekoppeld of een fout. */
export interface JiraState {
  mode: 'live' | 'demo' | 'off' | 'error';
  message?: string;
}

/** Waar de planning wordt bewaard: in deze browser, of in Supabase namens een ingelogde gebruiker. */
export type Backend = { kind: 'local' } | { kind: 'remote'; email: string };

export function useToast() {
  const [toast, setToast] = useState<string | null>(null);
  const timer = useRef<number>();
  const show = useCallback((msg: string) => {
    setToast(msg);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setToast(null), 3400);
  }, []);
  return [toast, show] as const;
}

export function usePlanning(toast: (msg: string) => void, initial: AppData, backend: Backend) {
  const [data, setData] = useState<AppData>(initial);
  const [syncing, setSyncing] = useState(false);
  const dataRef = useRef(data);
  dataRef.current = data;
  const syncingRef = useRef(false);
  const local = backend.kind === 'local';

  useRemoteSync(data, setData, backend.kind === 'remote' ? backend.email : null, toast);

  useEffect(() => {
    if (local) save(data);
  }, [data, local]);

  // Lokale modus: houd meerdere tabbladen in sync.
  useEffect(() => {
    if (!local) return;
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY || !e.newValue) return;
      try {
        setData(JSON.parse(e.newValue));
      } catch {
        /* negeren */
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [local]);

  const updItem = useCallback((id: string, patch: Partial<Item>) => {
    setData((d) => ({ ...d, items: d.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) }));
  }, []);

  const getItem = (id: string) => dataRef.current.items.find((x) => x.id === id);

  const setSetting = <K extends keyof Settings>(k: K, v: Settings[K]) =>
    setData((d) => ({ ...d, settings: { ...d.settings, [k]: v } }));

  // ── Jira ──────────────────────────────────────────────────────────────
  const [jira, setJira] = useState<JiraState>({ mode: initial.settings.demoSim ? 'demo' : 'off' });
  const remote = backend.kind === 'remote';

  const sync = useCallback(
    (manual: boolean) => {
      if (syncingRef.current) return;
      syncingRef.current = true;
      setSyncing(true);
      const done = () => {
        syncingRef.current = false;
        setSyncing(false);
      };
      const announce = (added: number, closed: number) => {
        if (added || closed) {
          toast(
            [
              added ? added + (added > 1 ? ' nieuwe aanvragen' : ' nieuwe aanvraag') + ' uit Jira' : '',
              closed ? closed + (closed > 1 ? ' tickets gesloten' : ' ticket gesloten') + ' in Jira' : '',
            ]
              .filter(Boolean)
              .join(' · '),
          );
        } else if (manual) toast('Alles up-to-date. Geen nieuwe aanvragen.');
      };

      void (async () => {
        if (remote) {
          const before = dataRef.current;
          const keys = before.items.filter((i) => i.source === 'jira' && !i.jiraClosed && !i.demo).map((i) => i.key);
          const res = await fetchLiveIssues(before.settings.jql, keys);
          if (res.ok) {
            // Samenvoegen met de nieuwste stand: tijdens het ophalen kan er al iets gewijzigd zijn.
            const d = dataRef.current;
            const r = mergeIssues(d, res.issues, false);
            const missing = new Set(res.missing);
            let gone = 0;
            const items = r.data.items.map((i) => {
              if (i.source !== 'jira' || i.jiraClosed || !missing.has(i.key)) return i;
              gone++;
              return { ...i, jiraClosed: true, status: 'Klaar' as Status, jiraStatus: 'Niet gevonden in Jira' };
            });
            const settings = res.site && res.site !== d.settings.site ? { ...d.settings, site: res.site } : d.settings;
            setData({ ...r.data, items, settings, lastSync: new Date().toISOString() });
            setJira({ mode: 'live' });
            done();
            announce(r.added, r.closed + gone);
            return;
          }
          if (res.code !== 'not_configured') {
            setJira({ mode: 'error', message: res.message });
            done();
            if (manual) toast(res.message);
            return;
          }
        }

        // Geen live koppeling: gesimuleerde demo-koppeling, of niets.
        await new Promise((ok) => window.setTimeout(ok, 800));
        const d = dataRef.current;
        done();
        if (!d.settings.demoSim) {
          setJira({ mode: 'off' });
          setData((x) => ({ ...x, lastSync: new Date().toISOString() }));
          if (manual) toast('Jira is nog niet gekoppeld. Importeer tussentijds een CSV-export via Instellingen.');
          return;
        }
        setJira({ mode: 'demo' });
        const issues = d.items.filter((i) => i.source === 'jira').map((i) => toIssue(i, d.members));
        const pool = demoPool();
        let idx = d.syncIdx || 0;
        if (idx < pool.length && (manual || Math.random() < 0.5)) {
          const ex = pool[idx++];
          issues.push(ex.issue);
          if (ex.close) {
            const t = issues.find((x) => x.key === ex.close);
            if (t) t.status = 'Done';
          }
        }
        const r = mergeIssues(d, issues, true);
        setData({ ...r.data, syncIdx: idx, lastSync: new Date().toISOString() });
        announce(r.added, r.closed);
      })();
    },
    [toast, remote],
  );

  // Uren aangepast in de tool: na een korte pauze (klaar met typen) ook in Jira bijwerken.
  const jiraRef = useRef(jira);
  jiraRef.current = jira;
  const estimateTimers = useRef<Record<string, number>>({});
  const setEstimate = (id: string, v: number | null) => {
    updItem(id, { estimate: v });
    const i = getItem(id);
    if (!remote || !i || i.source !== 'jira' || i.demo || jiraRef.current.mode !== 'live') return;
    window.clearTimeout(estimateTimers.current[id]);
    if (v == null || !(v > 0)) return;
    estimateTimers.current[id] = window.setTimeout(async () => {
      const cur = getItem(id);
      if (!cur || cur.estimate !== v || cur.jiraEstimate === v) return;
      const r = await pushEstimate(cur.key, v);
      if (r.ok) {
        updItem(id, { jiraEstimate: v });
        toast(`Uren bijgewerkt in Jira (${cur.key}: ${fmtH(v)}u)`);
      } else toast('Uren niet bijgewerkt in Jira: ' + r.message);
    }, 1500);
  };

  // Met database: direct bij het openen tickets ophalen.
  useEffect(() => {
    if (!remote) return;
    const t = window.setTimeout(() => syncRef.current(false), 1200);
    return () => window.clearTimeout(t);
  }, [remote]);

  const syncRef = useRef(sync);
  syncRef.current = sync;
  const { auto, interval } = data.settings;
  useEffect(() => {
    if (!auto) return;
    const t = window.setInterval(() => syncRef.current(false), Math.max(1, +interval || 5) * 60000);
    return () => window.clearInterval(t);
  }, [auto, interval]);

  /** Verwerkt een Jira CSV-export en geeft een statusmelding terug. */
  const importCsv = (text: string): string => {
    try {
      const issues = csvToIssues(text);
      if (!issues.length) return 'Geen tickets gevonden. Staat de kolom "Issue key" in de export?';
      const r = mergeIssues(dataRef.current, issues, false);
      setData({ ...r.data, lastSync: new Date().toISOString() });
      return `${issues.length} tickets gelezen: ${r.added} nieuw, ${r.updated} bijgewerkt${r.closed ? ', ' + r.closed + ' gesloten' : ''}.`;
    } catch {
      return 'Dit bestand kon ik niet lezen. Probeer een CSV-export uit Jira.';
    }
  };

  const exportCsv = () => {
    const n = exportPlanning(dataRef.current);
    toast('Planning geëxporteerd (' + n + ' regels)');
  };

  // ── Slepen in de weekplanning ─────────────────────────────────────────
  const dropOn = (drag: DragInfo, mId: string, w: string) => {
    const d = dataRef.current;
    const i = d.items.find((x) => x.id === drag.id);
    const m = d.members.find((x) => x.id === mId);
    if (!i || !m) return;
    if (i.recurring) {
      updItem(i.id, { assignee: mId, start: i.start || w, isNew: false });
      toast(i.title + ' loopt nu bij ' + m.name);
      return;
    }
    const al = (i.allocations || []).map((a) => ({ ...a }));
    let h: number;
    if (drag.from) {
      const from = drag.from;
      if (from.m === mId && from.w === w) return;
      const ix = al.findIndex((a) => a.m === from.m && a.w === from.w);
      if (ix < 0) return;
      h = +al[ix].h || 0;
      al.splice(ix, 1);
    } else {
      // Uit de inbox: plan de resterende uren in.
      h = Math.max(0, estimateOf(i) - al.reduce((t, a) => t + (+a.h || 0), 0));
    }
    const ex = al.find((a) => a.m === mId && a.w === w);
    if (ex) ex.h = (+ex.h || 0) + h;
    else al.push({ m: mId, w, h });
    updItem(i.id, { allocations: al, assignee: i.assignee || mId, isNew: false });
    toast(i.title + ' → ' + m.name.split(' ')[0] + ', week ' + weekNo(toDate(w)) + (h ? ' (' + fmtH(h) + 'u)' : ''));
  };

  const dropOnRail = (drag: DragInfo) => {
    const from = drag.from;
    if (!from) return;
    const i = getItem(drag.id);
    if (!i) return;
    updItem(i.id, { allocations: (i.allocations || []).filter((a) => !(a.m === from.m && a.w === from.w)) });
    toast(i.title + ' staat weer in de inbox');
  };

  // ── Planning van één item ─────────────────────────────────────────────
  const updAlloc = (id: string, ai: number, patch: Partial<Allocation>) => {
    const i = getItem(id);
    if (i) updItem(id, { allocations: i.allocations.map((a, k) => (k === ai ? { ...a, ...patch } : a)) });
  };

  const removeAlloc = (id: string, ai: number) => {
    const i = getItem(id);
    if (i) updItem(id, { allocations: i.allocations.filter((_, k) => k !== ai) });
  };

  const addAlloc = (id: string) => {
    const d = dataRef.current;
    const i = getItem(id);
    if (!i) return;
    const act = d.members.filter((m) => !m.archived);
    const al = i.allocations || [];
    const last = al[al.length - 1];
    const a: Allocation = {
      m: last ? last.m : i.assignee || act[0]?.id || '',
      w: last ? iso(addDays(toDate(last.w), 7)) : iso(monday(new Date())),
      h: Math.max(0, estimateOf(i) - allocSum(i)),
    };
    updItem(id, { allocations: [...al, a], assignee: i.assignee || a.m, isNew: false });
  };

  const spreadItem = (id: string, sp: { m: string; w: string; n: number }) => {
    const i = getItem(id);
    if (!i) return;
    const est = estimateOf(i);
    if (!est) return toast('Vul eerst de geschatte uren in.');
    if (!sp.m) return toast('Kies eerst een teamlid.');
    const n = Math.max(1, +sp.n || 1);
    const base = Math.floor((est / n) * 2) / 2;
    const al: Allocation[] = [];
    for (let k = 0; k < n; k++) {
      const h = k === n - 1 ? Math.round((est - base * (n - 1)) * 10) / 10 : base;
      if (h > 0) al.push({ m: sp.m, w: iso(addDays(toDate(sp.w), 7 * k)), h });
    }
    updItem(id, { allocations: al, assignee: i.assignee || sp.m, isNew: false });
    toast(fmtH(est) + 'u verdeeld over ' + n + (n === 1 ? ' week' : ' weken'));
  };

  const convertToJira = (id: string) => {
    const d = dataRef.current;
    const i = getItem(id);
    if (!i) return;
    const max = d.items
      .filter((x) => x.source === 'jira')
      .reduce((t, x) => Math.max(t, parseInt(String(x.key).split('-')[1]) || 0), 233);
    const key = 'MKT-' + (max + 1);
    updItem(id, { source: 'jira', key, type: 'Task', jiraStatus: STATUS_TO_JIRA[i.status], epic: i.project });
    toast('Omgezet naar ' + key + ' (gesimuleerd, nog niet in Jira aangemaakt)');
  };

  const unplan = (id: string) => {
    updItem(id, { allocations: [] });
    toast('Uit de planning gehaald');
  };

  const removeItem = (id: string) => {
    setData((d) => ({ ...d, items: d.items.filter((i) => i.id !== id) }));
    toast('Taak verwijderd');
  };

  // ── Taken ─────────────────────────────────────────────────────────────
  /** Valideert en bewaart een nieuwe taak. Geeft fouten terug, of null als het gelukt is. */
  const saveTask = (f: TaskForm): TaskErrors | null => {
    const errs: TaskErrors = {};
    const proj = f.project === '__new' ? f.newProject.trim() : f.project;
    if (!proj) errs.project = 'Kies een project of maak een nieuw project aan.';
    if (!f.title.trim()) errs.title = 'Wat moet er gebeuren?';
    const est = parseFloat(String(f.estimate).replace(',', '.'));
    if (!(est > 0)) errs.estimate = 'Vul een schatting in uren in.';
    if (Object.keys(errs).length) return errs;

    const it: Item = {
      ...blankItem(),
      id: uid(),
      source: 'manual',
      project: proj,
      title: f.title.trim(),
      estimate: est,
      assignee: f.assignee || null,
      start: f.start || (f.recurring ? f.week : ''),
      due: f.due,
      priority: f.priority,
      market: f.market,
      channel: f.channel,
      requester: f.requester,
      requesterName: f.requesterName.trim(),
      status: f.status,
      recurring: f.recurring,
      note: f.note,
    };
    if (!f.recurring && f.assignee && f.week) it.allocations = [{ m: f.assignee, w: f.week, h: est }];
    setData((d) => ({ ...d, items: [it, ...d.items], projects: d.projects.includes(proj) ? d.projects : [...d.projects, proj] }));
    toast(f.recurring ? 'Terugkerende taak toegevoegd' : it.allocations.length ? 'Taak toegevoegd en ingepland' : 'Taak toegevoegd aan de inbox');
    return null;
  };

  // ── Team ──────────────────────────────────────────────────────────────
  const saveMember = (f: MemberForm) => {
    const rec: Member = {
      id: f.id || 'm-' + uid(),
      name: f.name.trim(),
      role: f.role.trim(),
      color: f.color,
      initials: (f.initials || initialsOf(f.name)).slice(0, 3),
      hours: Math.max(0, +f.hours || 0),
      workdays: f.workdays.slice().sort(),
      type: f.type,
      vacations: f.vacations.filter((v) => v.from),
      archived: !!f.archived,
    };
    setData((d) => ({ ...d, members: f.id ? d.members.map((m) => (m.id === f.id ? rec : m)) : [...d.members, rec] }));
    toast(f.id ? 'Teamlid bijgewerkt' : rec.name + ' is toegevoegd aan het team');
  };

  const toggleArchive = (id: string) => {
    const m = dataRef.current.members.find((x) => x.id === id);
    if (!m) return;
    setData((d) => ({ ...d, members: d.members.map((x) => (x.id === id ? { ...x, archived: !x.archived } : x)) }));
    toast(m.archived ? m.name + ' is teruggezet' : m.name + ' is gearchiveerd');
  };

  /** Verwijdert een teamlid. Ingeplande uren gaan terug naar de inbox of naar `to`. */
  const deleteMember = (id: string, to: string | null) => {
    const d = dataRef.current;
    const m = d.members.find((x) => x.id === id);
    if (!m) return;
    const target = to && to !== id ? to : null;
    const items = d.items.map((i) => {
      let al = i.allocations || [];
      let ch = false;
      if (al.some((a) => a.m === id)) {
        ch = true;
        if (target) {
          const merged: Allocation[] = [];
          al.forEach((a) => {
            const b = a.m === id ? { ...a, m: target } : { ...a };
            const ex = merged.find((x) => x.m === b.m && x.w === b.w);
            if (ex) ex.h = +ex.h + +b.h;
            else merged.push(b);
          });
          al = merged;
        } else al = al.filter((a) => a.m !== id);
      }
      if (i.assignee === id) ch = true;
      return ch ? { ...i, allocations: al, assignee: i.assignee === id ? target : i.assignee } : i;
    });
    setData({ ...d, items, members: d.members.filter((x) => x.id !== id) });
    toast(m.name + ' is verwijderd' + (target ? '. Taken zijn overgezet.' : '. Taken staan weer in de inbox.'));
  };

  // ── Demo-data ─────────────────────────────────────────────────────────
  const clearDemo = () => {
    setData((d) => ({ ...d, items: d.items.filter((i) => !i.demo), settings: { ...d.settings, demoSim: false } }));
    toast('Demo-data gewist. Tijd voor het echte werk.');
  };

  const loadDemo = () => {
    const demo = buildDemo();
    setData((d) => {
      const ids = new Set(d.members.map((m) => m.id));
      return {
        ...d,
        items: [...d.items.filter((i) => !i.demo), ...demo.items],
        members: [...d.members, ...demo.members.filter((m) => !ids.has(m.id))],
        projects: [...new Set([...d.projects, ...demo.projects])],
        settings: { ...d.settings, demoSim: true },
        syncIdx: 0,
      };
    });
    toast('Demo-data geladen');
  };

  return {
    data,
    syncing,
    jira,
    updItem,
    setEstimate,
    setSetting,
    sync,
    importCsv,
    exportCsv,
    dropOn,
    dropOnRail,
    updAlloc,
    removeAlloc,
    addAlloc,
    spreadItem,
    convertToJira,
    unplan,
    removeItem,
    saveTask,
    saveMember,
    toggleArchive,
    deleteMember,
    clearDemo,
    loadDemo,
  };
}

export type Planning = ReturnType<typeof usePlanning>;
