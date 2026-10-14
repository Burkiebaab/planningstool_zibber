import { useState } from 'react';
import { fmtH } from '../lib/dates';
import type { Item, Member } from '../lib/types';
import { Modal, Options } from './ui';

interface Props {
  member: Member;
  others: Member[];
  items: Item[];
  onConfirm: (to: string | null) => void;
  onClose: () => void;
}

export function DeleteModal({ member, others, items, onConfirm, onClose }: Props) {
  const [mode, setMode] = useState<'inbox' | 'move'>('inbox');
  const [to, setTo] = useState(others[0]?.id || '');
  const tasks = items.filter((i) => (i.allocations || []).some((a) => a.m === member.id) || (i.recurring && i.assignee === member.id));
  const hours = items.reduce((t, i) => t + (i.allocations || []).filter((a) => a.m === member.id).reduce((x, a) => x + (+a.h || 0), 0), 0);
  const first = member.name.split(' ')[0];
  const move = mode === 'move';

  return (
    <Modal width={500} onClose={onClose}>
      <div className="modal-head" style={{ gap: 8, paddingBottom: 6 }}>
        <h2>{member.name} verwijderen?</h2>
        <p style={{ fontSize: 14, lineHeight: 1.5 }}>
          {tasks.length
            ? `${first} heeft ${tasks.length}${tasks.length === 1 ? ' taak' : ' taken'} ingepland (${fmtH(hours)}u). Wat moet daarmee gebeuren?`
            : `${first} heeft geen ingeplande taken. Dit kun je niet ongedaan maken.`}
        </p>
      </div>
      {tasks.length > 0 && (
        <div className="choice-list">
          <Choice active={!move} onClick={() => setMode('inbox')} title="Terug naar de inbox" sub="De taken staan weer klaar om in te plannen." />
          {others.length > 0 && (
            <>
              <Choice active={move} onClick={() => setMode('move')} title="Overzetten naar een ander teamlid" sub="Uren en weken blijven hetzelfde." />
              {move && (
                <select className="input input-lg" style={{ marginLeft: 44 }} value={to} onChange={(e) => setTo(e.target.value)}>
                  <Options list={others.map((m) => ({ value: m.id, label: m.name }))} />
                </select>
              )}
            </>
          )}
        </div>
      )}
      <div className="modal-foot" style={{ borderTop: 0 }}>
        <button type="button" className="btn btn-lg" onClick={onClose}>
          Annuleren
        </button>
        <button
          type="button"
          className="btn btn-lg btn-danger"
          onClick={() => {
            onConfirm(move ? to : null);
            onClose();
          }}
        >
          Verwijderen
        </button>
      </div>
    </Modal>
  );
}

function Choice({ active, onClick, title, sub }: { active: boolean; onClick: () => void; title: string; sub: string }) {
  return (
    <button type="button" className={'choice' + (active ? ' active' : '')} onClick={onClick}>
      <span className="radio">
        <span />
      </span>
      <span className="choice-text">
        <span style={{ fontSize: 14, fontWeight: 600 }}>{title}</span>
        <span className="muted" style={{ fontSize: 12.5 }}>{sub}</span>
      </span>
    </button>
  );
}
