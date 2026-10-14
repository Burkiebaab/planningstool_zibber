import { useState, type ChangeEvent } from 'react';
import { hhmm } from '../lib/dates';
import type { Settings } from '../lib/types';
import { Field, Modal, Options } from './ui';

interface Props {
  settings: Settings;
  lastSync: string;
  syncing: boolean;
  onSync: () => void;
  onSetting: <K extends keyof Settings>(k: K, v: Settings[K]) => void;
  onImport: (text: string) => string;
  onClose: () => void;
}

export function SettingsModal({ settings: S, lastSync, syncing, onSync, onSetting, onImport, onClose }: Props) {
  const [csvMsg, setCsvMsg] = useState('');

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const rd = new FileReader();
    rd.onload = () => setCsvMsg(onImport(String(rd.result)));
    rd.readAsText(file);
    e.target.value = '';
  };

  return (
    <Modal width={640} onClose={onClose}>
      <div className="modal-head">
        <h2>Jira-koppeling</h2>
        <p>Bepaal welke tickets in de intake-inbox binnenkomen.</p>
      </div>
      <div className="modal-body" style={{ gap: 16 }}>
        <div className="status-box">
          <span className="dot" style={{ width: 10, height: 10, marginTop: 5, background: S.demoSim ? '#3FA27A' : '#E2B65C' }} />
          <div className="status-box-text">
            <span style={{ fontSize: 14, fontWeight: 700 }}>{S.demoSim ? 'Gesimuleerde koppeling (demo)' : 'Geen live koppeling actief'}</span>
            <span style={{ fontSize: 13, color: '#3A4A66', lineHeight: 1.5 }}>
              {S.demoSim
                ? 'Er is nog geen echte Jira-verbinding. Deze demo laat zien hoe nieuwe intake-tickets binnenkomen en hoe matching op Issue key werkt.'
                : 'Koppel Jira Cloud via je beheerder, of importeer tussentijds een CSV-export hieronder.'}
            </span>
            <span className="muted" style={{ fontSize: 12.5 }}>Laatst gesynchroniseerd om {hhmm(new Date(lastSync || Date.now()))}</span>
          </div>
          <button type="button" className="btn btn-sm btn-primary" style={{ flexShrink: 0 }} onClick={onSync}>
            {syncing ? 'Ophalen…' : 'Nu ophalen'}
          </button>
        </div>

        <div className="form-grid" style={{ gap: 12 }}>
          <Field label="Jira-site">
            <input className="input" value={S.site} onChange={(e) => onSetting('site', e.target.value)} />
          </Field>
          <Field label="Project(en)">
            <input className="input" placeholder="MKT, WEB" value={S.projects} onChange={(e) => onSetting('projects', e.target.value)} />
          </Field>
          <Field label="JQL-filter" wide>
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
