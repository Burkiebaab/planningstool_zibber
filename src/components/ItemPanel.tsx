import { useState } from 'react';
import { CHANNELS, MARKETS, PRIORITIES, STATUSES } from '../lib/constants';
import { fmt, fmtH } from '../lib/dates';
import type { Derived } from '../lib/derive';
import { allocSum, estimateOf, personOf } from '../lib/planning';
import type { Planning } from '../lib/store';
import type { Item, Priority, Recurring, Status } from '../lib/types';
import { Field, NewBadge, NumberInput, Options, SrcTag, type Opt } from './ui';

export const RECUR_OPTS: Opt[] = [
  { value: '', label: 'Niet terugkerend' },
  { value: 'wekelijks', label: 'Wekelijks' },
  { value: 'maandelijks', label: 'Maandelijks' },
];
const SPREAD_OPTS: Opt[] = [1, 2, 3, 4, 5, 6, 8].map((n) => ({ value: String(n), label: n + (n === 1 ? ' week' : ' weken') }));

interface Props {
  item: Item;
  dv: Derived;
  site: string;
  jiraLive: boolean;
  weekOpts: Opt[];
  pl: Planning;
  onClose: () => void;
}

export function ItemPanel({ item: sel, dv, site, jiraLive, weekOpts, pl, onClose }: Props) {
  const memberOpts: Opt[] = dv.active.map((m) => ({ value: m.id, label: m.name }));
  const assigneeOpts: Opt[] = [{ value: '', label: 'Niemand' }, ...memberOpts];
  const [spread, setSpread] = useState({ m: sel.assignee || dv.active[0]?.id || '', w: dv.mon0i, n: 2 });

  const up = (patch: Partial<Item>) => pl.updItem(sel.id, patch);
  const est = estimateOf(sel);
  const sum = allocSum(sel);
  const am = dv.byId[sel.assignee || ''];
  const warnings = dv.warningsOf(sel.id);
  const isJira = sel.source === 'jira';
  const jiraUrl = 'https://' + site + '/browse/' + sel.key;
  const projectOpts = dv.projects.includes(sel.project) || !sel.project ? dv.projects : [sel.project, ...dv.projects];

  const text = (k: 'title' | 'start' | 'due' | 'channel' | 'requester' | 'requesterName' | 'note') => ({
    value: (k === 'requesterName' ? personOf(sel) : sel[k]) || '',
    onChange: (e: { target: { value: string } }) => up({ [k]: e.target.value }),
  });

  return (
    <>
      <div className="panel-backdrop" onClick={onClose} />
      <aside className="panel">
        <div className="panel-head">
          <SrcTag source={sel.source} />
          {isJira && (
            <a href={jiraUrl} target="_blank" rel="noopener" style={{ fontSize: 13, fontWeight: 700 }}>
              {sel.key}
            </a>
          )}
          {sel.isNew && <NewBadge />}
          {sel.jiraClosed && <span className="badge badge-danger">Gesloten in Jira</span>}
          <div style={{ flex: 1 }} />
          <button type="button" className="close-btn" title="Sluiten" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="panel-body">
          <textarea className="panel-title" rows={2} {...text('title')} />

          {warnings.length > 0 && (
            <div className="panel-warnings">
              {warnings.map((w) => (
                <div key={w}>
                  <span className="dot" style={{ width: 6, height: 6, background: '#D27466' }} />
                  {w}
                </div>
              ))}
            </div>
          )}

          <div className="form-grid">
            <Field label="Project" wide>
              <select className="input" value={sel.project} onChange={(e) => up({ project: e.target.value })}>
                <Options list={projectOpts} />
              </select>
            </Field>
            <Field label="Status">
              <select className="input" value={sel.status} onChange={(e) => up({ status: e.target.value as Status })}>
                <Options list={STATUSES} />
              </select>
            </Field>
            <Field label="Prioriteit">
              <select className="input" value={sel.priority} onChange={(e) => up({ priority: e.target.value as Priority })}>
                <Options list={PRIORITIES} />
              </select>
            </Field>
            <Field label="Toegewezen aan">
              <select className="input" value={sel.assignee || ''} onChange={(e) => up({ assignee: e.target.value || null })}>
                <Options list={assigneeOpts} />
              </select>
            </Field>
            <Field label="Geschatte tijd (uren)">
              <NumberInput className="input" value={sel.estimate} onValue={(v) => pl.setEstimate(sel.id, v)} placeholder="Nog niet ingeschat" />
              {isJira && jiraLive && sel.jiraEstimate !== undefined && sel.estimate !== sel.jiraEstimate && (
                <span className="field-hint">In Jira: {sel.jiraEstimate ? fmtH(sel.jiraEstimate) + 'u' : 'leeg'}</span>
              )}
            </Field>
            <Field label="Startdatum">
              <input className="input" type="date" {...text('start')} />
            </Field>
            <Field label="Deadline">
              <input className="input" type="date" {...text('due')} />
            </Field>
            <Field label="Markt">
              <select className="input" value={sel.market || 'Alle'} onChange={(e) => up({ market: e.target.value })}>
                <Options list={MARKETS} />
              </select>
            </Field>
            <Field label="Kanaal">
              <select className="input" {...text('channel')}>
                <Options list={[{ value: '', label: 'Geen kanaal' }, ...CHANNELS]} />
              </select>
            </Field>
            <Field label="Aanvrager">
              <input className="input" placeholder="Naam van de aanvrager" {...text('requesterName')} />
            </Field>
            <Field label="Afdeling">
              <select className="input" {...text('requester')}>
                <Options list={[{ value: '', label: 'Onbekend' }, ...dv.reqList]} />
              </select>
            </Field>
            <Field label="Terugkerend">
              <select className="input" value={sel.recurring || ''} onChange={(e) => up({ recurring: e.target.value as Recurring })}>
                <Options list={RECUR_OPTS} />
              </select>
            </Field>
          </div>

          <div className="panel-section">
            <div className="panel-section-head">
              <span className="panel-h">Planning</span>
              {!sel.recurring && (
                <span className="muted" style={{ fontSize: 12.5, fontWeight: 600 }}>
                  {fmtH(sum)} van {est ? fmtH(est) + 'u' : '? u'} ingepland
                </span>
              )}
            </div>
            {sel.recurring ? (
              <p className="info-box">
                {am
                  ? `Blokt automatisch ${fmtH(est)}u ${sel.recurring === 'wekelijks' ? 'per week' : 'in de eerste week van elke maand'} bij ${am.name}.`
                  : 'Kies hierboven wie deze vaste taak doet. Dan blokt hij automatisch capaciteit.'}
              </p>
            ) : (
              <div className="alloc-list">
                {(sel.allocations || []).map((a, ai) => (
                  <div key={ai} className="alloc-row">
                    <select className="input input-sm" value={a.m} onChange={(e) => pl.updAlloc(sel.id, ai, { m: e.target.value })}>
                      <Options list={memberOpts} />
                    </select>
                    <select className="input input-sm" value={a.w} onChange={(e) => pl.updAlloc(sel.id, ai, { w: e.target.value })}>
                      <Options list={weekOpts} />
                    </select>
                    <NumberInput className="input input-sm" value={a.h} onValue={(v) => pl.updAlloc(sel.id, ai, { h: v ?? 0 })} />
                    <button type="button" className="x-btn" title="Verwijder" onClick={() => pl.removeAlloc(sel.id, ai)}>
                      ×
                    </button>
                  </div>
                ))}
                {!(sel.allocations || []).length && (
                  <span className="muted" style={{ fontSize: 13 }}>
                    Nog niet ingepland. Sleep het in de weekplanning of verdeel de uren hieronder.
                  </span>
                )}
                <button type="button" className="link-btn" style={{ alignSelf: 'flex-start', padding: '4px 0' }} onClick={() => pl.addAlloc(sel.id)}>
                  + Week toevoegen
                </button>
                <div className="spread-box">
                  <span>Verdeel {est ? fmtH(est) + 'u' : 'de uren'} gelijk over meerdere weken</span>
                  <div className="spread-row">
                    <select className="input input-xs" value={spread.m} onChange={(e) => setSpread({ ...spread, m: e.target.value })}>
                      <Options list={memberOpts} />
                    </select>
                    <select className="input input-xs" value={spread.w} onChange={(e) => setSpread({ ...spread, w: e.target.value })}>
                      <Options list={weekOpts} />
                    </select>
                    <select className="input input-xs" value={String(spread.n)} onChange={(e) => setSpread({ ...spread, n: +e.target.value })}>
                      <Options list={SPREAD_OPTS} />
                    </select>
                    <button type="button" className="btn-dark-sm" onClick={() => pl.spreadItem(sel.id, spread)}>
                      Verdeel
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <label className="panel-note">
            Notitie
            <textarea className="input textarea" rows={3} placeholder="Context, links of afspraken" {...text('note')} />
          </label>

          {isJira && (
            <div className="panel-section">
              <span className="panel-h">Uit Jira</span>
              <div className="kv kv-jira">
                <span>Issue type</span>
                <span>{sel.type || '—'}</span>
                <span>Jira-status</span>
                <span>{sel.jiraStatus || '—'}</span>
                <span>Reporter</span>
                <span>{sel.reporter || '—'}</span>
                <span>Aangemaakt</span>
                <span>{fmt(sel.created)}</span>
                <span>Labels</span>
                <span>{(sel.labels || []).join(', ') || '—'}</span>
                <span>Components</span>
                <span>{(sel.components || []).join(', ') || '—'}</span>
                <span>Epic / parent</span>
                <span>{sel.epic || '—'}</span>
              </div>
              <span style={{ fontSize: 12, color: '#7A89A3' }}>Jira-velden worden bij elke sync bijgewerkt. Je planning blijft staan.</span>
            </div>
          )}
        </div>

        <div className="panel-foot">
          {isJira ? (
            <a className="btn btn-md btn-link" href={jiraUrl} target="_blank" rel="noopener">
              Open in Jira ↗
            </a>
          ) : (
            // Met een live koppeling zou een gesimuleerd ticketnummer kunnen botsen met een echt ticket.
            !jiraLive && (
              <button type="button" className="btn btn-md" onClick={() => pl.convertToJira(sel.id)}>
                Omzetten naar Jira-ticket
              </button>
            )
          )}
          <div style={{ flex: 1 }} />
          {isJira ? (
            <button type="button" className="link-btn link-muted" onClick={() => pl.unplan(sel.id)}>
              Uit planning halen
            </button>
          ) : (
            <button
              type="button"
              className="link-btn link-danger"
              onClick={() => {
                pl.removeItem(sel.id);
                onClose();
              }}
            >
              Verwijderen
            </button>
          )}
        </div>
      </aside>
    </>
  );
}
