import { hhmm } from '../lib/dates';
import type { Settings, View } from '../lib/types';

export const VIEWS: [View, string][] = [
  ['inbox', 'Intake-inbox'],
  ['week', 'Weekplanning'],
  ['quarter', 'Kwartaaloverzicht'],
  ['team', 'Team & capaciteit'],
];

interface Props {
  view: View;
  onView: (v: View) => void;
  inboxCount: number;
  settings: Settings;
  lastSync: string;
  syncing: boolean;
  onSync: () => void;
  onSettings: () => void;
}

export function Sidebar({ view, onView, inboxCount, settings, lastSync, syncing, onSync, onSettings }: Props) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-name">zibber</div>
        <div className="brand-sub">Marketingplanning</div>
      </div>
      <nav className="nav">
        {VIEWS.map(([k, label]) => (
          <button key={k} type="button" className={'nav-btn' + (view === k ? ' active' : '')} onClick={() => onView(k)}>
            <span>{label}</span>
            {k === 'inbox' && inboxCount > 0 && <span className="nav-count">{inboxCount}</span>}
          </button>
        ))}
      </nav>
      <div style={{ flex: 1 }} />
      <div className="sync-card">
        <div className="sync-head">
          <span className="dot" style={{ background: settings.demoSim ? '#7FD1A8' : '#E2B65C' }} />
          <span className="sync-title">Jira</span>
          <span className="sync-mode">{settings.demoSim ? 'Demo-koppeling' : 'Niet gekoppeld'}</span>
        </div>
        <div className="sync-text">
          Laatst gesynchroniseerd om {hhmm(new Date(lastSync || Date.now()))}
          <br />
          {settings.auto ? `Ververst elke ${settings.interval} min` : 'Automatisch verversen staat uit'}
        </div>
        <div className="sync-actions">
          <button type="button" className="sync-btn" onClick={onSync}>
            {syncing ? 'Ophalen…' : 'Nu ophalen'}
          </button>
          <button type="button" className="sync-settings" onClick={onSettings} title="Jira-instellingen">
            Instellingen
          </button>
        </div>
      </div>
    </aside>
  );
}
