import type { Account } from '../App';
import { hhmm } from '../lib/dates';
import { initialsOf } from '../lib/planning';
import type { JiraState } from '../lib/store';
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
  account?: Account;
  jira: JiraState;
}

export const JIRA_DOT: Record<JiraState['mode'], string> = { live: '#7FD1A8', demo: '#7FD1A8', off: '#E2B65C', error: '#E08A7C' };
const JIRA_LABEL: Record<JiraState['mode'], string> = { live: 'Live gekoppeld', demo: 'Demo-koppeling', off: 'Niet gekoppeld', error: 'Fout bij ophalen' };

export function Sidebar({ view, onView, inboxCount, settings, lastSync, syncing, onSync, onSettings, account, jira }: Props) {
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
          <span className="dot" style={{ background: JIRA_DOT[jira.mode] }} />
          <span className="sync-title">Jira</span>
          <span className="sync-mode">{JIRA_LABEL[jira.mode]}</span>
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
      {account && (
        <div className="account">
          <span className="account-avatar">{initialsOf(account.name) || '?'}</span>
          <span className="account-text">
            <span className="account-name">{account.name}</span>
            <button type="button" className="account-logout" onClick={account.onSignOut}>
              Uitloggen
            </button>
          </span>
        </div>
      )}
    </aside>
  );
}
