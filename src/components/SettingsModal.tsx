import { useState, type ChangeEvent } from 'react';
import { hhmm } from '../lib/dates';
import type { JiraState } from '../lib/store';
import type { Settings } from '../lib/types';
import { Field, Modal, Options } from './ui';

interface Props {
  settings: Settings;
  jira: JiraState;
  lastSync: string;
  syncing: boolean;
  onSync: () => void;
  onSetting: <K extends keyof Settings>(k: K, v: Settings[K]) => void;
  onImport: (text: string) => string;
  onClose: () => void;
}

export function SettingsModal({ settings: S, jira, lastSync, syncing, onSync, onSetting, onImport, onClose }: Props) {
  const [csvMsg, setCsvMsg] = useState('');

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const rd = new FileReader();
    rd.onload = () => setCsvMsg(onImport(String(rd.result)));
    rd.readAsText(file);
    e.target.value = '';
  };

  const status = {
    live: {
      dot: '#3FA27A',
      title: 'Live gekoppeld met Jira',
      text: `Tickets uit ${S.site} die aan de JQL hieronder voldoen, komen automatisch bij Nog inplannen. Matching gebeurt op Issue key: je planning blijft staan, alleen Jira-velden worden bijgewerkt.`,
    },
    demo: {
      dot: '#3FA27A',
      title: 'Gesimuleerde koppeling (demo)',
      text: 'Er is nog geen echte Jira-verbinding. Deze demo laat zien hoe nieuwe intake-tickets binnenkomen en hoe matching op Issue key werkt.',
    },
    off: {
      dot: '#E2B65C',
      title: 'Geen live koppeling actief',
      text: 'Vul JIRA_SITE, JIRA_EMAIL en JIRA_API_TOKEN in bij Vercel om Jira te koppelen, of importeer tussentijds een CSV-export hieronder.',
    },
    error: { dot: '#D27466', title: 'Ophalen uit Jira mislukt', text: jira.message || 'Onbekende fout.' },
  }[jira.mode];

  return (
    <Modal width={640} onClose={onClose}>
      <div className="modal-head">
        <h2>Jira-koppeling</h2>
        <p>Bepaal welke tickets bij Nog inplannen binnenkomen.</p>
      </div>
      <div className="modal-body" style={{ gap: 16 }}>
        <div className="status-box">
          <span className="dot" style={{ width: 10, height: 10, marginTop: 5, background: status.dot }} />
          <div className="status-box-text">
            <span style={{ fontSize: 14, fontWeight: 700 }}>{status.title}</span>
            <span style={{ fontSize: 13, color: '#3A4A66', lineHeight: 1.5 }}>{status.text}</span>
            <span className="muted" style={{ fontSize: 12.5 }}>Laatst gesynchroniseerd om {hhmm(new Date(lastSync || Date.now()))}</span>
          </div>
          <button type="button" className="btn btn-sm btn-primary" style={{ flexShrink: 0 }} onClick={onSync}>
            {syncing ? 'Ophalen…' : 'Nu ophalen'}
          </button>
        </div>

        <div className="form-grid" style={{ gap: 12 }}>
          <Field label="Jira-site" wide>
            {/* Bij een live koppeling bepaalt de server (JIRA_SITE) de site; dit veld volgt die. */}
            <input className="input" value={S.site} readOnly={jira.mode === 'live'} onChange={(e) => onSetting('site', e.target.value)} />
          </Field>
          <Field label="JQL-filter (welke tickets binnenkomen)" wide>
            <textarea className="input textarea mono" rows={2} value={S.jql} onChange={(e) => onSetting('jql', e.target.value)} />
          </Field>
        </div>

        <div className="settings-auto">
          <button type="button" className="toggle" onClick={() => onSetting('auto', !S.auto)}>
            <span className={'switch' + (S.auto ? ' on' : '')}>
              <span />
            </span>
            Automatisch verversen
          </button>
          <select className="input input-sm" style={{ width: 'auto' }} value={String(S.interval)} onChange={(e) => onSetting('interval', +e.target.value)}>
            <Options list={[1, 5, 15, 30].map((n) => ({ value: String(n), label: 'Elke ' + n + ' min' }))} />
          </select>
        </div>

        <div className="field-group">
          <span className="field-label">Velden die worden opgehaald</span>
          <span className="muted" style={{ fontSize: 12.5, lineHeight: 1.6 }}>
            Issue key, Summary, Issue Type, Status, Priority, Assignee, Reporter, Created, Due date, Original Estimate, Labels, Components, Epic/Parent. Matching gebeurt op Issue key: je planning blijft staan, alleen Jira-velden worden bijgewerkt.
          </span>
        </div>

        <div className="csv-box">
          <div className="status-box-text">
            <span style={{ fontSize: 14, fontWeight: 700 }}>Import via Jira CSV-export</span>
            <span className="muted" style={{ fontSize: 13 }}>
              Werkt de live koppeling niet? Exporteer je filter in Jira als CSV en upload het hier. Dezelfde matchinglogica.
            </span>
          </div>
          <label className="btn btn-md" style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center' }}>
            CSV-bestand kiezen
            <input type="file" accept=".csv,text/csv" onChange={onFile} style={{ display: 'none' }} />
          </label>
          {csvMsg && <span style={{ fontSize: 13, fontWeight: 600 }}>{csvMsg}</span>}
        </div>
      </div>
      <div className="modal-foot">
        <button type="button" className="btn btn-lg btn-dark" onClick={onClose}>
          Klaar
        </button>
      </div>
    </Modal>
  );
}
