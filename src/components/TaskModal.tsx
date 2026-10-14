import { useState } from 'react';
import { CHANNELS, MARKETS, PRIORITIES, STATUSES } from '../lib/constants';
import type { Derived } from '../lib/derive';
import type { TaskErrors, TaskForm } from '../lib/store';
import { RECUR_OPTS } from './ItemPanel';
import { Field, Modal, Options, type Opt } from './ui';

export const emptyTaskForm = (preset?: Partial<TaskForm>): TaskForm => ({
  project: '',
  newProject: '',
  title: '',
  estimate: '',
  assignee: '',
  week: '',
  start: '',
  due: '',
  priority: 'Normaal',
  market: 'NL',
  channel: '',
  requester: '',
  requesterName: '',
  status: 'To do',
  recurring: '',
  note: '',
  ...preset,
});

interface Props {
  preset?: Partial<TaskForm>;
  dv: Derived;
  weekOpts: Opt[];
  onSave: (f: TaskForm) => TaskErrors | null;
  onClose: () => void;
}

export function TaskModal({ preset, dv, weekOpts, onSave, onClose }: Props) {
  const [f, setF] = useState(() => emptyTaskForm(preset));
  const [errs, setErrs] = useState<TaskErrors>({});
  const bind = <K extends keyof TaskForm>(k: K) => ({
    value: f[k],
    onChange: (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value as TaskForm[K] })),
  });
  const errBorder = (k: keyof TaskErrors) => ({ borderColor: errs[k] ? '#D27466' : undefined });
  const assigneeOpts: Opt[] = [{ value: '', label: 'Niemand' }, ...dv.active.map((m) => ({ value: m.id, label: m.name }))];

  const save = () => {
    const e = onSave(f);
    if (e) setErrs(e);
    else onClose();
  };

  return (
    <Modal width={640} onClose={onClose}>
      <div className="modal-head">
        <h2>{f.recurring ? 'Nieuwe terugkerende taak' : 'Nieuwe taak'}</h2>
        <p>Alleen project, werkzaamheid en uren zijn verplicht. De rest kan later.</p>
      </div>
      <div className="modal-body">
        <Field label="Project *">
          <select className="input input-lg" style={errBorder('project')} {...bind('project')}>
            <Options list={[{ value: '', label: 'Kies een project' }, ...dv.projects, { value: '__new', label: '+ Nieuw project…' }]} />
          </select>
          {f.project === '__new' && <input className="input input-lg" placeholder="Naam van het nieuwe project" autoFocus {...bind('newProject')} />}
          {errs.project && <span className="field-error">{errs.project}</span>}
        </Field>
        <div className="form-grid form-grid-title">
          <Field label="Werkzaamheid *">
            <input className="input input-lg" placeholder="Bijv. Nieuwsbrief december NL" style={errBorder('title')} {...bind('title')} />
            {errs.title && <span className="field-error">{errs.title}</span>}
          </Field>
          <Field label="Geschatte tijd (uren) *">
            <input className="input input-lg" inputMode="decimal" placeholder="8" style={errBorder('estimate')} {...bind('estimate')} />
            {errs.estimate && <span className="field-error">{errs.estimate}</span>}
          </Field>
        </div>
        <div className="divider-label">
          <span className="eyebrow">Optioneel</span>
          <span className="divider-line" />
        </div>
        <div className="form-grid">
          <Field label="Toegewezen aan">
            <select className="input" {...bind('assignee')}>
              <Options list={assigneeOpts} />
            </select>
          </Field>
          <Field label="Week">
            <select className="input" {...bind('week')}>
              <Options list={[{ value: '', label: 'Nog niet' }, ...weekOpts.slice(8)]} />
            </select>
          </Field>
          <Field label="Startdatum">
            <input className="input" type="date" {...bind('start')} />
          </Field>
          <Field label="Deadline">
            <input className="input" type="date" {...bind('due')} />
          </Field>
          <Field label="Prioriteit">
            <select className="input" {...bind('priority')}>
              <Options list={PRIORITIES} />
            </select>
          </Field>
          <Field label="Markt">
            <select className="input" {...bind('market')}>
              <Options list={MARKETS} />
            </select>
          </Field>
          <Field label="Kanaal">
            <select className="input" {...bind('channel')}>
              <Options list={[{ value: '', label: 'Geen kanaal' }, ...CHANNELS]} />
            </select>
          </Field>
          <Field label="Aanvrager">
            <input className="input" placeholder="Bijv. Sanne de Wit" {...bind('requesterName')} />
          </Field>
          <Field label="Afdeling">
            <select className="input" {...bind('requester')}>
              <Options list={[{ value: '', label: 'Onbekend' }, ...dv.reqList]} />
            </select>
          </Field>
          <Field label="Status">
            <select className="input" {...bind('status')}>
              <Options list={STATUSES} />
            </select>
          </Field>
          <Field label="Terugkerend">
            <select className="input" {...bind('recurring')}>
              <Options list={RECUR_OPTS} />
            </select>
          </Field>
          <Field label="Notitie" wide>
            <textarea className="input textarea" rows={2} placeholder="Context of links" {...bind('note')} />
          </Field>
        </div>
      </div>
      <div className="modal-foot">
        <button type="button" className="btn btn-lg" onClick={onClose}>
          Annuleren
        </button>
        <button type="button" className="btn btn-lg btn-primary" onClick={save}>
          Taak toevoegen
        </button>
      </div>
    </Modal>
  );
}
