import { useState } from 'react';
import { Assignee } from '../components/Assignee';
import { SrcTag } from '../components/ui';
import { NO_PROJECT } from '../lib/constants';
import { fmt, fmtH } from '../lib/dates';
import type { Derived } from '../lib/derive';
import { allocSum, estimateOf, isDone, projColor } from '../lib/planning';
import type { Item, Status } from '../lib/types';

interface Props {
  dv: Derived;
  items: Item[];
  match: (i: Item) => boolean;
  /** Er staat een filter of zoekterm aan: projecten zonder treffers verbergen. */
  filtering: boolean;
  site: string;
  onSelect: (id: string) => void;
}

const STATUS_CLASS: Record<Status, string> = { 'To do': 'st-todo', Bezig: 'st-busy', Review: 'st-review', Klaar: 'st-done' };

export function ProjectsView({ dv, items, match, filtering, site, onSelect }: Props) {
  const [showDone, setShowDone] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const byName = (a: string, b: string) => a.localeCompare(b, 'nl');

  const groups: Record<string, Item[]> = {};
  items.filter(match).forEach((i) => {
    const k = i.project || NO_PROJECT;
    (groups[k] = groups[k] || []).push(i);
  });

  // Eerst de projecten uit de keuzelijst (met Jira: de epics, ook zonder taken), dan overige projecten
  // die nog bij taken in gebruik zijn, en "Zonder project" als laatste.
  const epicKey = new Map(dv.epics.map((e) => [e.name, e.key] as [string, string]));
  const base = dv.projectOptions.filter((n) => n !== NO_PROJECT);
  const others = Object.keys(groups)
    .filter((n) => !base.includes(n) && n !== NO_PROJECT)
    .sort(byName);
  const names = [...base, ...others, ...(groups[NO_PROJECT] ? [NO_PROJECT] : [])].filter((n) => !filtering || groups[n]?.length);

  const today = dv.tIso;
  const sortTasks = (a: Item, b: Item) =>
    Number(isDone(a)) - Number(isDone(b)) || (a.due || '9999').localeCompare(b.due || '9999') || byName(a.title, b.title);

  return (
    <div className="projects">
      <div className="projects-toolbar">
        <span className="muted" style={{ fontSize: 14 }}>
          {names.length + (names.length === 1 ? ' project' : ' projecten')}
          {dv.epicsActive ? ' · epics uit Jira' : ''}
        </span>
        <div className="row-gap8">
          <label className="check">
            <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />
            Afgeronde taken tonen
          </label>
          <button type="button" className="btn btn-sm" onClick={() => setCollapsed(Object.fromEntries(names.map((n) => [n, true])))}>
            Alles inklappen
          </button>
          <button type="button" className="btn btn-sm" onClick={() => setCollapsed({})}>
            Alles uitklappen
          </button>
        </div>
      </div>

      {names.length === 0 && (
        <div className="empty-state">
          <div className="empty-title">Geen projecten gevonden</div>
          <div className="muted" style={{ fontSize: 14 }}>
            {filtering ? 'Probeer een andere zoekterm of wis de filters.' : 'Maak epics aan in Jira; ze verschijnen hier na de volgende sync.'}
          </div>
        </div>
      )}

      {names.map((name) => {
        const all = (groups[name] || []).slice().sort(sortTasks);
        const open = all.filter((i) => !isDone(i));
        const tasks = showDone ? all : open;
        const plannable = open.filter((i) => !i.recurring);
        const est = plannable.reduce((t, i) => t + estimateOf(i), 0);
        const planned = plannable.reduce((t, i) => t + Math.min(allocSum(i), estimateOf(i) || allocSum(i)), 0);
        const pct = est ? Math.min(100, (planned / est) * 100) : 0;
        const nextDue = open.map((i) => i.due).filter((d) => d && d >= today).sort()[0];
        const key = epicKey.get(name);
        const isCollapsed = !!collapsed[name];
        const toggle = () => setCollapsed({ ...collapsed, [name]: !isCollapsed });

        return (
          <section key={name} className="project-card">
            <div
              className="project-head"
              role="button"
              tabIndex={0}
              aria-expanded={!isCollapsed}
              onClick={toggle}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  toggle();
                }
              }}
            >
              <span className={'chevron' + (isCollapsed ? '' : ' open')}>›</span>
              <span className="dot" style={{ width: 10, height: 10, borderRadius: 3, background: name === NO_PROJECT ? '#C9D3E3' : projColor(name) }} />
              <span className="project-name">{name}</span>
              {key && (
                <a className="project-key" href={'https://' + site + '/browse/' + key} target="_blank" rel="noopener" onClick={(e) => e.stopPropagation()}>
                  {key} ↗
                </a>
              )}
              <span className="project-stats">
                <span>
                  <strong>{open.length}</strong> open{all.length > open.length ? ` · ${all.length - open.length} afgerond` : ''}
                </span>
                {nextDue && <span>Eerstvolgende deadline {fmt(nextDue)}</span>}
                <span className="project-progress" title={`${fmtH(planned)} van ${fmtH(est)}u ingepland`}>
                  <span className="bar" style={{ width: 90 }}>
                    <div style={{ width: pct + '%', background: pct >= 100 ? '#86C3A3' : '#8DA6CF' }} />
                  </span>
                  {fmtH(planned)} / {fmtH(est)}u
                </span>
              </span>
            </div>

            {!isCollapsed && (
              <div className="project-body">
                {tasks.length === 0 ? (
                  <div className="muted project-empty">{all.length ? 'Alle taken zijn afgerond.' : 'Nog geen taken in dit project.'}</div>
                ) : (
                  <>
                    <div className="project-grid eyebrow project-grid-head">
                      <span>Werkzaamheid</span>
                      <span>Status</span>
                      <span>Uitvoerder</span>
                      <span>Deadline</span>
                      <span style={{ textAlign: 'right' }}>Ingepland</span>
                    </div>
                    {tasks.map((i) => {
                      const e = estimateOf(i);
                      const late = !!i.due && i.due < today && !isDone(i);
                      return (
                        <div key={i.id} className={'project-grid project-row' + (isDone(i) ? ' is-done' : '')} onClick={() => onSelect(i.id)}>
                          <span className="project-task">
                            <span className="ellipsis" style={{ fontWeight: 600 }}>
                              {i.title}
                            </span>
                            <span className="row-gap6 muted" style={{ fontSize: 12 }}>
                              <SrcTag source={i.source} small />
                              {i.key && <span>{i.key}</span>}
                              {i.recurring && <span>↻ {i.recurring === 'wekelijks' ? 'Wekelijks' : 'Maandelijks'}</span>}
                            </span>
                          </span>
                          <span>
                            <span className={'status-pill ' + STATUS_CLASS[i.status]}>{i.status}</span>
                          </span>
                          <Assignee member={dv.byId[i.assignee || '']} jiraName={i.jiraAssignee} />
                          <span style={{ fontSize: 13, fontWeight: late ? 600 : 400, color: late ? '#B5493C' : '#3A4A66' }}>{i.due ? fmt(i.due) : '—'}</span>
                          <span className="project-hours">{i.recurring ? fmtH(e) + 'u' : `${fmtH(allocSum(i))} / ${e ? fmtH(e) : '?'}u`}</span>
                        </div>
                      );
                    })}
                  </>
                )}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
