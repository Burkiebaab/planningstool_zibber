import { useState } from 'react';
import { CHANNELS, MARKETS, PRIORITIES, STATUSES } from '../lib/constants';
import { fmt, fmtH } from '../lib/dates';
import type { Derived } from '../lib/derive';
import { allocSum, estimateOf, isDone, personOf } from '../lib/planning';
import type { JiraState, Planning } from '../lib/store';
import type { Item, Priority, Recurring, Status } from '../lib/types';
import { JiraComments } from './JiraComments';
import { Field, LinkedText, NewBadge, NumberInput, Options, SrcTag, type Opt } from './ui';

export const RECUR_OPTS: Opt[] = [
  { value: '', label: 'Niet terugkerend' },
  { value: 'wekelijks', label: 'Wekelijks' },
  { value: 'maandelijks', label: 'Maandelijks' },
];
const SPREAD_OPTS: Opt[] = [1, 2, 3, 4, 5, 6, 8].map((n) => ({ value: String(n), label: n + (n === 1 ? ' week' : ' weken') }));

interface Props {
  item: Item;
  /** Alle items, om subtaken en de hoofdtaak in de planning te vinden. */
  items: Item[];
  dv: Derived;
  site: string;
  jiraMode: JiraState['mode'];
  onSelect: (id: string) => void;
  weekOpts: Opt[];
  pl: Planning;
  onClose: () => void;
}

export function ItemPanel({ item: sel, items, dv, site, jiraMode, onSelect, weekOpts, pl, onClose }: Props) {
  const jiraLive = jiraMode === 'live';
  const [confirmConvert, setConfirmConvert] = useState(false);
  const [converting, setConverting] = useState(false);
  const [descOpen, setDescOpen] = useState(false);
  const memberOpts: Opt[] = dv.active.map((m) => ({ value: m.id, label: m.name }));
  const assigneeOpts: Opt[] = [{ value: '', label: 'Niemand' }, ...memberOpts];
  const [spread, setSpread] = useState({ m: sel.assignee || dv.active[0]?.id || '', w: dv.mon0i, n: 2 });

  const up = (patch: Partial<Item>) => pl.updItem(sel.id, patch);
  const est = estimateOf(sel);
  const sum = allocSum(sel);
  const am = dv.byId[sel.assignee || ''];
  const warnings = dv.warningsOf(sel.id);
  const isJira = sel.source === 'jira';
  // Live (of tijdelijk fout): echt ticket aanmaken. Demo: gesimuleerd nummer. Niet gekoppeld: niet tonen.
  const realConvert = jiraMode === 'live' || jiraMode === 'error';
  const canConvert = !sel.recurring && (realConvert || jiraMode === 'demo');
  const jiraUrl = 'https://' + site + '/browse/' + sel.key;
  const subtasks = subtasksOf(sel, items);
  const parent = sel.jiraParent;
  const parentItem = parent && items.find((i) => i.source === 'jira' && i.key === parent.key);
  // Een subtaak valt in Jira altijd onder de epic van zijn hoofdtaak; die kun je hier niet los wijzigen.
  const projectLocked = !!parent && jiraLive;
  const projectOpts = dv.projectOptions.includes(sel.project) || !sel.project ? dv.projectOptions : [sel.project, ...dv.projectOptions];

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

          {isJira && sel.jiraDescription !== undefined && (
            <div className="panel-section">
              <span className="panel-h">Omschrijving</span>
              {sel.jiraDescription ? (
                <>
                  <LinkedText text={sel.jiraDescription} className={'jira-desc' + (descOpen ? '' : ' jira-desc-clamp')} />
                  {(sel.jiraDescription.length > 400 || sel.jiraDescription.split('\n').length > 8) && (
                    <button type="button" className="link-btn" style={{ alignSelf: 'flex-start', padding: 0 }} onClick={() => setDescOpen(!descOpen)}>
                      {descOpen ? 'Minder tonen' : 'Meer tonen'}
                    </button>
                  )}
                </>
              ) : (
                <span className="muted" style={{ fontSize: 13 }}>Geen omschrijving in Jira.</span>
              )}
            </div>
          )}

          {parent && (
            <div className="panel-section">
              <span className="panel-h">Hoofdtaak</span>
              <SubRow
                k={parent.key}
                title={parentItem ? parentItem.title : parent.title}
                item={parentItem}
                dv={dv}
                jiraUrl={'https://' + site + '/browse/' + parent.key}
                onSelect={onSelect}
              />
            </div>
          )}

          {(subtasks.length > 0 || (isJira && !parent && sel.jiraSubtasks)) && (
            <div className="panel-section">
              <div className="panel-section-head">
                <span className="panel-h">Subtaken</span>
                {subtasks.length > 0 && (
                  <span className="muted" style={{ fontSize: 12.5, fontWeight: 600 }}>
                    {subtasks.filter((t) => t.done).length} van {subtasks.length} klaar
                  </span>
                )}
              </div>
              {subtasks.length ? (
                <div className="sub-list">
                  {subtasks.map((t) => (
                    <SubRow
                      key={t.key}
                      k={t.key}
                      title={t.title}
                      status={t.status}
                      done={t.done}
                      item={t.item}
                      dv={dv}
                      jiraUrl={'https://' + site + '/browse/' + t.key}
                      onSelect={onSelect}
                    />
                  ))}
                </div>
              ) : (
                <span className="muted" style={{ fontSize: 13 }}>Geen subtaken in Jira.</span>
              )}
            </div>
          )}

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
            <Field label={dv.epicsActive ? 'Project (epic in Jira)' : 'Project'} wide>
              <select className="input" value={sel.project} disabled={projectLocked} onChange={(e) => void pl.setProject(sel.id, e.target.value)}>
                <Options list={projectOpts} />
              </select>
              {projectLocked && <span className="field-hint">Volgt de epic van de hoofdtaak in Jira.</span>}
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
            {!sel.recurring && (
              <label className="check-row">
                <input type="checkbox" checked={!!sel.noPlanning} onChange={(e) => pl.setNoPlanning(sel.id, e.target.checked)} />
                <span>
                  Niet inplannen
                  <span className="field-hint">Haalt de taak uit Nog inplannen en de takenlijst van de weekplanning, bijv. een hoofdtaak waarvan je alleen de subtaken inplant.</span>
                </span>
              </label>
            )}
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
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={!!a.done}
                      className={'chip-check' + (a.done ? ' on' : '')}
                      title={a.done ? 'Afgevinkt. Klik om weer open te zetten.' : 'Afvinken als gedaan (alleen in de planning, niet in Jira)'}
                      onClick={() => pl.updAlloc(sel.id, ai, { done: !a.done })}
                    >
                      {a.done ? '✓' : ''}
                    </button>
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
            {isJira ? 'Interne notitie' : 'Notitie'}
            {isJira && <span className="field-hint">Alleen zichtbaar in de planningstool. Gebruik "Opmerkingen in Jira" om iets in het ticket te zetten.</span>}
            <textarea className="input textarea" rows={3} placeholder="Context, links of afspraken" {...text('note')} />
          </label>

          {isJira && jiraLive && !sel.demo && <JiraComments issueKey={sel.key} />}

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

        {confirmConvert && (
          <div className="convert-confirm">
            <div className="convert-confirm-text">
              <strong>Ticket aanmaken in Jira?</strong>
              <span>
                Er komt een nieuw ticket in project MKT met de titel, notitie, aanvrager, deadline, uren, prioriteit en markt/kanaal van deze taak. Je planning blijft staan.
              </span>
            </div>
            <div className="convert-confirm-actions">
              <button type="button" className="btn btn-md" disabled={converting} onClick={() => setConfirmConvert(false)}>
                Annuleren
              </button>
              <button
                type="button"
                className="btn btn-md btn-primary"
                disabled={converting || !sel.title.trim()}
                onClick={async () => {
                  setConverting(true);
                  const newId = await pl.convertToJira(sel.id);
                  setConverting(false);
                  setConfirmConvert(false);
                  if (newId && newId !== sel.id) onSelect(newId);
                }}
              >
                {converting ? 'Aanmaken…' : 'Ticket aanmaken'}
              </button>
            </div>
          </div>
        )}
        <div className="panel-foot">
          {isJira ? (
            <a className="btn btn-md btn-link" href={jiraUrl} target="_blank" rel="noopener">
              Open in Jira ↗
            </a>
          ) : (
            canConvert && (
              <button type="button" className="btn btn-md" disabled={converting} onClick={() => (realConvert ? setConfirmConvert(true) : void pl.convertToJira(sel.id))}>
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

interface SubtaskEntry {
  key: string;
  title: string;
  status: string;
  done: boolean;
  item?: Item;
}

/** Subtaken van een item: volgens Jira, aangevuld met items in de planning die dit ticket als hoofdtaak hebben. */
function subtasksOf(sel: Item, items: Item[]): SubtaskEntry[] {
  if (sel.source !== 'jira' || !sel.key) return [];
  const byKey = new Map(items.filter((i) => i.source === 'jira').map((i) => [i.key, i]));
  const out: SubtaskEntry[] = (sel.jiraSubtasks || []).map((t) => ({ ...t, item: byKey.get(t.key) }));
  items.forEach((i) => {
    if (i.source === 'jira' && i.jiraParent?.key === sel.key && !out.some((t) => t.key === i.key))
      out.push({ key: i.key, title: i.title, status: i.jiraStatus, done: isDone(i), item: i });
  });
  return out;
}

/** Eén subtaak of hoofdtaak: opent het item in de planning, of anders het ticket in Jira. */
function SubRow(p: { k: string; title: string; status?: string; done?: boolean; item?: Item; dv: Derived; jiraUrl: string; onSelect: (id: string) => void }) {
  const i = p.item;
  const done = p.done ?? (i ? isDone(i) : false);
  const status = p.status ?? i?.jiraStatus ?? '';
  const who = i ? [...new Set((i.allocations || []).map((a) => p.dv.byId[a.m]?.name).filter(Boolean))].join(', ') : '';
  const plan = !i
    ? 'Niet in de planning'
    : i.noPlanning
      ? 'Niet inplannen'
      : (i.allocations || []).length
        ? fmtH(allocSum(i)) + 'u ingepland' + (who ? ' · ' + who : '')
        : 'Nog niet ingepland';
  const body = (
    <>
      <span className={'sub-check' + (done ? ' on' : '')}>{done ? '✓' : ''}</span>
      <span className="sub-main">
        <span className="sub-title">
          <strong>{p.k}</strong> {p.title}
        </span>
        <span className="sub-meta">
          {status && <span>{status}</span>}
          <span>{plan}</span>
        </span>
      </span>
      {!i && <span className="sub-ext">↗</span>}
    </>
  );
  return i ? (
    <button type="button" className={'sub-row' + (done ? ' sub-done' : '')} title="Openen" onClick={() => p.onSelect(i.id)}>
      {body}
    </button>
  ) : (
    <a className={'sub-row' + (done ? ' sub-done' : '')} href={p.jiraUrl} target="_blank" rel="noopener" title="Openen in Jira">
      {body}
    </a>
  );
}
