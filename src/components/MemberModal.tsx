import { useState } from 'react';
import { COLORS, DAYS } from '../lib/constants';
import { fmtH, iso } from '../lib/dates';
import { initialsOf } from '../lib/planning';
import type { MemberForm } from '../lib/store';
import type { Member, Vacation } from '../lib/types';
import { Avatar, Field, Modal, Segmented } from './ui';

interface Props {
  member: Member | null;
  memberCount: number;
  onSave: (f: MemberForm) => void;
  onClose: () => void;
}

export function MemberModal({ member, memberCount, onSave, onClose }: Props) {
  const [f, setF] = useState<MemberForm>(() =>
    member
      ? { ...member, vacations: member.vacations.map((v) => ({ ...v })) }
      : { id: null, name: '', role: '', color: COLORS[memberCount % COLORS.length], initials: '', hours: 32, workdays: [1, 2, 3, 4, 5], type: 'intern', vacations: [], archived: false },
  );
  // Initialen volgen de naam totdat iemand ze zelf aanpast.
  const [initTouched, setInitTouched] = useState(!!member);
  const [err, setErr] = useState('');
  const set = (patch: Partial<MemberForm>) => setF((x) => ({ ...x, ...patch }));
  const setVac = (vi: number, patch: Partial<Vacation>) => set({ vacations: f.vacations.map((v, k) => (k === vi ? { ...v, ...patch } : v)) });
  const wd = f.workdays;
  const initials = f.initials || initialsOf(f.name) || '?';

  const save = () => {
    if (!f.name.trim()) return setErr('Vul een naam in.');
    onSave(f);
    onClose();
  };

  return (
    <Modal width={580} onClose={onClose}>
      <div className="modal-head modal-head-row">
        <Avatar color={f.color} initials={initials} size={44} fontSize={15} />
        <h2>{f.id ? 'Teamlid bewerken' : 'Nieuw teamlid'}</h2>
      </div>
      <div className="modal-body" style={{ gap: 16 }}>
        <div className="form-grid" style={{ gap: 12 }}>
          <Field label="Naam *">
            <input
              className="input input-lg"
              placeholder="Voor- en achternaam"
              autoFocus
              value={f.name}
              onChange={(e) => {
                const v = e.target.value;
                setErr('');
                set({ name: v, initials: initTouched ? f.initials : initialsOf(v) });
              }}
            />
            {err && <span className="field-error">{err}</span>}
          </Field>
          <Field label="Rol">
            <input className="input input-lg" placeholder="Bijv. Content marketeer" value={f.role} onChange={(e) => set({ role: e.target.value })} />
          </Field>
          <Field label="Initialen">
            <input
              className="input input-lg"
              value={initials === '?' ? '' : initials}
              onChange={(e) => {
                setInitTouched(true);
                set({ initials: e.target.value.toUpperCase().slice(0, 3) });
              }}
            />
          </Field>
          <Field label="Uren per week">
            <input
              className="input input-lg"
              type="number"
              min={0}
              step={1}
              value={f.hours}
              onChange={(e) => set({ hours: e.target.value === '' ? '' : Math.max(0, +e.target.value) })}
            />
          </Field>
        </div>

        <div className="field-group">
          <span className="field-label">Kleur</span>
          <div className="swatches">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={'Kleur ' + c}
                style={{ background: c, boxShadow: f.color === c ? `0 0 0 2px #FFFFFF, 0 0 0 4px ${c}` : 'none' }}
                onClick={() => set({ color: c })}
              />
            ))}
          </div>
        </div>

        <div className="field-group">
          <span className="field-label">
            Werkdagen <span style={{ fontWeight: 500, color: '#7A89A3' }}>{wd.length && f.hours ? '· ' + fmtH(+f.hours / wd.length) + 'u per werkdag' : ''}</span>
          </span>
          <div className="days">
            {DAYS.map((d, k) => {
              const on = wd.includes(k + 1);
              return (
                <button key={d} type="button" className={on ? 'on' : ''} onClick={() => set({ workdays: on ? wd.filter((x) => x !== k + 1) : [...wd, k + 1] })}>
                  {d}
                </button>
              );
            })}
          </div>
        </div>

        <div className="field-group">
          <span className="field-label">Type</span>
          <div style={{ alignSelf: 'flex-start' }}>
            <Segmented options={[['intern', 'Intern'], ['extern', 'Extern']]} value={f.type} onChange={(type) => set({ type })} />
          </div>
        </div>

        <div className="field-group">
          <span className="field-label">Vrije dagen en vakantie</span>
          {f.vacations.map((v, vi) => (
            <div key={vi} className="vac-row">
              <input className="input input-sm" type="date" value={v.from || ''} onChange={(e) => setVac(vi, { from: e.target.value })} />
              <input className="input input-sm" type="date" value={v.to || ''} onChange={(e) => setVac(vi, { to: e.target.value })} />
              <input className="input input-sm" placeholder="Omschrijving" value={v.label || ''} onChange={(e) => setVac(vi, { label: e.target.value })} />
              <button type="button" className="x-btn" title="Verwijder" onClick={() => set({ vacations: f.vacations.filter((_, k) => k !== vi) })}>
                ×
              </button>
            </div>
          ))}
          {!f.vacations.length && <span className="muted" style={{ fontSize: 13 }}>Geen vrije dagen gepland.</span>}
          <button
            type="button"
            className="link-btn"
            style={{ alignSelf: 'flex-start', padding: '2px 0' }}
            onClick={() => {
              const t = iso(new Date());
              set({ vacations: [...f.vacations, { from: t, to: t, label: '' }] });
            }}
          >
            + Periode toevoegen
          </button>
        </div>
      </div>
      <div className="modal-foot">
        <button type="button" className="btn btn-lg" onClick={onClose}>
          Annuleren
        </button>
        <button type="button" className="btn btn-lg btn-primary" onClick={save}>
          Opslaan
        </button>
      </div>
    </Modal>
  );
}
