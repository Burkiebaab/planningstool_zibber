import { CHANNELS } from '../lib/constants';
import type { WarnEntry } from '../lib/derive';
import type { Filters } from '../lib/types';
import { Options, type Opt } from './ui';

interface Props {
  title: string;
  sub: string;
  warnList: WarnEntry[];
  warnOpen: boolean;
  onToggleWarn: () => void;
  onWarn: (w: WarnEntry) => void;
  onExport: () => void;
  onNewTask: () => void;
  search: string;
  onSearch: (v: string) => void;
  filters: Filters;
  onFilter: (k: keyof Filters, v: string) => void;
  onClear: () => void;
  projects: string[];
  persons: string[];
  assignees: Opt[];
}

export function Header(p: Props) {
  const fdef: [keyof Filters, Opt[]][] = [
    ['source', [{ value: '', label: 'Alle bronnen' }, { value: 'jira', label: 'Jira' }, { value: 'manual', label: 'Handmatig' }]],
    ['project', [{ value: '', label: 'Alle projecten' }, ...p.projects]],
    ['channel', [{ value: '', label: 'Alle kanalen' }, ...CHANNELS]],
    ['market', [{ value: '', label: 'Alle markten' }, 'NL', 'BE', 'DE']],
    ['requester', [{ value: '', label: 'Alle aanvragers' }, ...p.persons]],
    ['assignee', [{ value: '', label: 'Alle uitvoerders' }, ...p.assignees]],
  ];
  const filtersOn = Object.values(p.filters).some(Boolean) || !!p.search.trim();
  const n = p.warnList.length;

  return (
    <header className="header">
      <div className="header-top">
        <div className="header-titles">
          <h1>{p.title}</h1>
          <p>{p.sub}</p>
        </div>
        <div className="header-actions">
          {n > 0 && (
            <div style={{ position: 'relative' }}>
              <button type="button" className="warn-btn" onClick={p.onToggleWarn}>
                <span className="warn-btn-icon">!</span>
                <span>{n + (n === 1 ? ' waarschuwing' : ' waarschuwingen')}</span>
              </button>
              {p.warnOpen && (
                <div className="dropdown warn-list">
                  {p.warnList.map((w, k) => (
                    <button key={k} type="button" className="warn-item" onClick={() => p.onWarn(w)}>
                      <span className="dot" style={{ background: w.color, marginTop: 6 }} />
                      <span className="warn-item-text">
                        <span className="warn-item-title">{w.title}</span>
                        <span className="warn-item-sub">{w.sub}</span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <button type="button" className="btn" onClick={p.onExport}>
            Exporteer CSV
          </button>
          <button type="button" className="btn btn-primary btn-cta" onClick={p.onNewTask}>
            + Taak
          </button>
        </div>
      </div>
      <div className="header-filters">
        <div className="search">
          <input value={p.search} onChange={(e) => p.onSearch(e.target.value)} placeholder="Zoek op titel, key, hoofdtaak, project of persoon" />
          <span className="search-icon" />
        </div>
        {fdef.map(([k, list]) => (
          <select key={k} className={'filter' + (p.filters[k] ? ' filter-on' : '')} value={p.filters[k]} onChange={(e) => p.onFilter(k, e.target.value)}>
            <Options list={list} />
          </select>
        ))}
        {filtersOn && (
          <button type="button" className="link-btn" onClick={p.onClear}>
            Wis filters
          </button>
        )}
      </div>
    </header>
  );
}
