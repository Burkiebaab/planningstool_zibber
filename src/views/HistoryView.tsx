import { useState } from 'react';
import { dayLabel, useHistory } from '../components/History';
import { Options, Segmented } from '../components/ui';
import { hhmm } from '../lib/dates';
import { entryText, JIRA_ACTOR, type HistoryEntry, type HistoryLog } from '../lib/history';
import { initialsOf } from '../lib/planning';
import type { Item, Member } from '../lib/types';

type Kind = 'all' | 'item' | 'member';
const KINDS: [Kind, string][] = [
  ['all', 'Alles'],
  ['item', 'Taken'],
  ['member', 'Team'],
];

interface Props {
  log: HistoryLog;
  items: Item[];
  members: Member[];
  search: string;
  onSelect: (id: string) => void;
  onEditMember: (id: string) => void;
}

/** Overzicht van alle recente wijzigingen, per dag. */
export function HistoryView({ log, items, members, search, onSelect, onEditMember }: Props) {
  const [limit, setLimit] = useState(200);
  const [kind, setKind] = useState<Kind>('all');
  const [who, setWho] = useState('');
  const { entries, more, loading, error } = useHistory(log, { limit });

  const itemIds = new Set(items.map((i) => i.id));
  const memberIds = new Set(members.map((m) => m.id));
  const people = [...new Map(entries.map((e) => [e.by, e.byName])).entries()].sort((a, b) => a[1].localeCompare(b[1], 'nl'));
  const q = search.trim().toLowerCase();
  const shown = entries.filter(
    (e) => (kind === 'all' || e.kind === kind) && (!who || e.by === who) && (!q || (e.title + ' ' + entryText(e) + ' ' + e.byName).toLowerCase().includes(q)),
  );

  // Groeperen per dag, en binnen een dag opeenvolgende regels van dezelfde persoon voor hetzelfde item samen.
  const days: { day: string; groups: HistoryEntry[][] }[] = [];
  shown.forEach((e) => {
    const day = dayLabel(e.at);
    let d = days[days.length - 1];
    if (!d || d.day !== day) days.push((d = { day, groups: [] }));
    const g = d.groups[d.groups.length - 1];
    if (g && g[0].ref === e.ref && g[0].by === e.by && new Date(g[g.length - 1].at).getTime() - new Date(e.at).getTime() < 15 * 60 * 1000) g.push(e);
    else d.groups.push([e]);
  });

  const open = (e: HistoryEntry) => {
    if (e.kind === 'item' && itemIds.has(e.ref)) onSelect(e.ref);
    if (e.kind === 'member' && memberIds.has(e.ref)) onEditMember(e.ref);
  };
  const canOpen = (e: HistoryEntry) => (e.kind === 'item' ? itemIds.has(e.ref) : memberIds.has(e.ref));

  return (
    <div className="projects">
      <div className="projects-toolbar">
        <span className="muted" style={{ fontSize: 14 }}>
          {log.remote ? 'Wijzigingen van het hele team, nieuwste eerst.' : 'Wijzigingen in deze browser (zonder database niet gedeeld).'}
        </span>
        <div className="row-gap8">
          <Segmented small options={KINDS} value={kind} onChange={setKind} />
          <select className={'filter' + (who ? ' filter-on' : '')} value={who} onChange={(e) => setWho(e.target.value)}>
            <Options list={[{ value: '', label: 'Iedereen' }, ...people.map(([value, label]) => ({ value, label }))]} />
          </select>
        </div>
      </div>

      {error && <div className="info-box">{error}</div>}

      {!error && !shown.length && (
        <div className="empty-state">
          <div className="empty-title">{loading ? 'Laden…' : 'Geen wijzigingen gevonden'}</div>
          {!loading && (
            <div className="muted" style={{ fontSize: 14 }}>
              {entries.length ? 'Probeer een andere zoekterm of filter.' : 'Zodra iemand iets in de planning wijzigt, verschijnt het hier.'}
            </div>
          )}
        </div>
      )}

      {days.map((d) => (
        <section key={d.day} className="project-card">
          <div className="project-head" style={{ cursor: 'default' }}>
            <span className="project-name">{d.day}</span>
          </div>
          <div className="hist-list">
            {d.groups.map((g) => {
              const e = g[0];
              const jira = e.by === JIRA_ACTOR.email;
              const clickable = canOpen(e);
              return (
                <div
                  key={e.id}
                  className={'hist-group' + (clickable ? ' hist-click' : '')}
                  role={clickable ? 'button' : undefined}
                  tabIndex={clickable ? 0 : undefined}
                  onClick={() => clickable && open(e)}
                  onKeyDown={(ev) => {
                    if (clickable && (ev.key === 'Enter' || ev.key === ' ')) {
                      ev.preventDefault();
                      open(e);
                    }
                  }}
                >
                  <span className={'hist-avatar' + (jira ? ' hist-avatar-jira' : '')} title={e.byName}>
                    {jira ? 'J' : initialsOf(e.byName) || '?'}
                  </span>
                  <span className="hist-main">
                    <span className="hist-head">
                      <strong>{e.byName}</strong>
                      <span className="muted">{e.kind === 'member' ? 'teamlid' : 'taak'}</span>
                      <span className="hist-title">{e.title || '(zonder titel)'}</span>
                      <span className="hist-time">{hhmm(new Date(e.at))}</span>
                    </span>
                    {g.map((x) => (
                      <span key={x.id} className="hist-text">
                        {entryText(x)}
                      </span>
                    ))}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      ))}

      {more && (
        <button type="button" className="btn btn-sm" style={{ alignSelf: 'center' }} onClick={() => setLimit(limit + 200)}>
          Oudere wijzigingen laden
        </button>
      )}
    </div>
  );
}
