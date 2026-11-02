import { useEffect, useState } from 'react';
import { NL_MF } from '../lib/constants';
import { hhmm, iso } from '../lib/dates';
import { entryText, JIRA_ACTOR, type HistoryEntry, type HistoryLog, type HistoryQuery } from '../lib/history';
import { initialsOf } from '../lib/planning';

/** Laadt geschiedenisregels en houdt ze bij (eigen wijzigingen en die van collega's). */
export function useHistory(log: HistoryLog, q: HistoryQuery) {
  const [entries, setEntries] = useState<HistoryEntry[]>(() => log.cached(q));
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(log.error);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    log
      .load(q)
      .then((r) => {
        if (!alive) return;
        setEntries(log.cached(q));
        setMore(r.more);
      })
      .catch(() => undefined)
      .finally(() => alive && setLoading(false));
    const off = log.onChange(() => {
      setEntries(log.cached(q));
      setError(log.error);
    });
    return () => {
      alive = false;
      off();
    };
  }, [log, q.ref, q.limit]);

  return { entries, more, loading, error: error || log.error };
}

const dayLabel = (s: string) => {
  const d = new Date(s);
  const today = new Date();
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (iso(d) === iso(today)) return 'Vandaag';
  if (iso(d) === iso(yesterday)) return 'Gisteren';
  return d.getDate() + ' ' + NL_MF[d.getMonth()] + (d.getFullYear() !== today.getFullYear() ? ' ' + d.getFullYear() : '');
};

/** "vandaag 14:02", "gisteren 09:10" of "3 nov 16:45". */
export const whenText = (s: string) => {
  const l = dayLabel(s);
  return (l === 'Vandaag' || l === 'Gisteren' ? l.toLowerCase() : l) + ' ' + hhmm(new Date(s));
};

function Who({ e }: { e: HistoryEntry }) {
  const jira = e.by === JIRA_ACTOR.email;
  return (
    <span className={'hist-avatar' + (jira ? ' hist-avatar-jira' : '')} title={e.byName}>
      {jira ? 'J' : initialsOf(e.byName) || '?'}
    </span>
  );
}

/** Korte lijst voor in het zijpaneel van één item. */
export function ItemHistory({ log, itemId }: { log: HistoryLog; itemId: string }) {
  const [limit, setLimit] = useState(5);
  const { entries, more, loading, error } = useHistory(log, { ref: itemId, limit });

  return (
    <div className="panel-section">
      <div className="panel-section-head">
        <span className="panel-h">Geschiedenis</span>
        {!log.remote && <span className="muted" style={{ fontSize: 12 }}>Alleen in deze browser</span>}
      </div>
      {error ? (
        <span className="muted" style={{ fontSize: 13 }}>{error}</span>
      ) : !entries.length ? (
        <span className="muted" style={{ fontSize: 13 }}>{loading ? 'Laden…' : 'Nog geen wijzigingen vastgelegd.'}</span>
      ) : (
        <div className="hist-list hist-list-compact">
          {entries.map((e) => (
            <div key={e.id} className="hist-row">
              <Who e={e} />
              <span className="hist-main">
                <span className="hist-text">{entryText(e)}</span>
                <span className="hist-meta">
                  {e.byName} · {whenText(e.at)}
                </span>
              </span>
            </div>
          ))}
        </div>
      )}
      {more && (
        <button type="button" className="link-btn" style={{ alignSelf: 'flex-start', padding: 0 }} onClick={() => setLimit(limit + 20)}>
          Meer tonen
        </button>
      )}
    </div>
  );
}

export { dayLabel };
