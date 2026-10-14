import type { MouseEvent } from 'react';
import { CAP_BAR, CAP_FG, FULL_THRESHOLD, type CapState } from '../lib/constants';
import { addDays, fmt, fmtH, iso, weekNo } from '../lib/dates';
import type { Derived } from '../lib/derive';
import { capOf, dayLabel, memberInitials } from '../lib/planning';
import type { Member } from '../lib/types';
import { Avatar } from '../components/ui';

interface Props {
  dv: Derived;
  members: Member[];
  demoCount: number;
  onAddMember: () => void;
  onEditMember: (id: string) => void;
  onMemberMenu: (e: MouseEvent, id: string) => void;
  onRestore: (id: string) => void;
  onDelete: (id: string) => void;
  onAddRecurring: () => void;
  onSelect: (id: string) => void;
  onClearDemo: () => void;
  onLoadDemo: () => void;
}

export function TeamView(p: Props) {
  const { dv } = p;
  const archived = p.members.filter((m) => m.archived);
  const capWeeks = Array.from({ length: 8 }, (_, k) => {
    const d = addDays(dv.mon0, 7 * k);
    return { iso: iso(d), label: 'Wk ' + weekNo(d), cur: k === 0 };
  });

  return (
    <div className="team">
      <section className="section">
        <div className="section-head">
          <h2>Team</h2>
          <button type="button" className="btn btn-md" onClick={p.onAddMember}>
            + Teamlid
          </button>
        </div>
        <div className="team-cards">
          {dv.active.map((m) => {
            const vac = (m.vacations || [])
              .filter((v) => (v.to || v.from) >= dv.tIso)
              .map((v) => fmt(v.from) + (v.to && v.to !== v.from ? ' – ' + fmt(v.to) : ''))
              .join(', ');
            return (
              <div key={m.id} className="team-card">
                <div className="row-gap12">
                  <Avatar color={m.color} initials={memberInitials(m)} size={42} fontSize={14} />
                  <div className="team-card-name">
                    <span style={{ fontSize: 15, fontWeight: 700 }}>{m.name}</span>
                    <span className="muted" style={{ fontSize: 13 }}>{m.role || '—'}</span>
                  </div>
                  <button type="button" className="more-btn more-btn-lg" title="Opties" onClick={(e) => p.onMemberMenu(e, m.id)}>
                    ⋯
                  </button>
                </div>
                <div className="kv">
                  <span>Uren</span>
                  <strong>{fmtH(m.hours)}u per week</strong>
                  <span>Werkdagen</span>
                  <span>{dayLabel(m)}</span>
                  <span>Type</span>
                  <span>{m.type === 'extern' ? 'Extern' : 'Intern'}</span>
                  <span>Vrij</span>
                  <span>{vac || 'Niets gepland'}</span>
                </div>
                <button type="button" className="btn-white" onClick={() => p.onEditMember(m.id)}>
                  Bewerken
                </button>
              </div>
            );
          })}
        </div>
        {archived.length > 0 && (
          <div className="archived">
            <span className="eyebrow" style={{ fontSize: 12 }}>Gearchiveerd</span>
            {archived.map((m) => (
              <div key={m.id} className="archived-row">
                <Avatar color="#C5CFDF" initials={memberInitials(m)} size={28} fontSize={11} />
                <span className="muted" style={{ flex: 1, fontSize: 14 }}>
                  {m.name} · {m.role || '—'}
                </span>
                <button type="button" className="link-btn" onClick={() => p.onRestore(m.id)}>
                  Terugzetten
                </button>
                <button type="button" className="link-btn link-danger" onClick={() => p.onDelete(m.id)}>
                  Verwijderen
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="section">
        <div className="section-titles">
          <h2>Capaciteit komende 8 weken</h2>
          <p>Bezetting inclusief terugkerende taken en vrije dagen.</p>
        </div>
        <div className="cap-table-wrap">
          <div className="cap-table">
            <div className="cap-th eyebrow">Teamlid</div>
            {capWeeks.map((w) => (
              <div key={w.iso} className="cap-th" style={{ fontSize: 12.5, fontWeight: 700, color: w.cur ? '#1F7FF0' : '#3A4A66' }}>
                {w.label}
              </div>
            ))}
            {dv.active.map((m) => (
              <CapRow key={m.id} m={m} weeks={capWeeks.map((w) => w.iso)} plOf={dv.plOf} />
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-head" style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="section-titles">
            <h2>Terugkerende taken</h2>
            <p>Deze taken blokken automatisch capaciteit in de weekplanning.</p>
          </div>
          <button type="button" className="btn btn-md" onClick={p.onAddRecurring}>
            + Terugkerende taak
          </button>
        </div>
        <div className="recurring-list">
          {dv.recurs.map((i) => {
            const m = dv.byId[i.assignee || ''];
            return (
              <div key={i.id} className="recurring-row" onClick={() => p.onSelect(i.id)}>
                <div className="recurring-title">
                  <span style={{ fontSize: 14, fontWeight: 600 }}>{i.title}</span>
                  <span className="muted" style={{ fontSize: 12.5 }}>{i.project}</span>
                </div>
                <span style={{ fontSize: 13, color: '#3A4A66' }}>{i.recurring === 'wekelijks' ? 'Wekelijks' : 'Maandelijks'}</span>
                <span style={{ fontSize: 14, fontWeight: 700 }}>{fmtH(i.estimate || 0)}u</span>
                <span className="row-gap8" style={{ fontSize: 13 }}>
                  <Avatar color={m ? m.color : '#C9D3E3'} initials={m ? memberInitials(m) : '?'} size={24} fontSize={10} />
                  {m ? m.name : 'Niet toegewezen'}
                </span>
              </div>
            );
          })}
          {dv.recurs.length === 0 && <div className="dashed-empty">Nog geen vaste taken. Denk aan rapportages of de wekelijkse social-planning.</div>}
        </div>
      </section>

      <section className="demo-box">
        <div className="section-titles">
          <h3>Demo-data</h3>
          <p>{p.demoCount ? p.demoCount + ' voorbeelditems staan in de planning. Wis ze zodra je met echte aanvragen start.' : 'Er staat geen demo-data in de planning.'}</p>
        </div>
        {p.demoCount > 0 ? (
          <button type="button" className="btn btn-md btn-outline-danger" onClick={p.onClearDemo}>
            Demo-data wissen
          </button>
        ) : (
          <button type="button" className="btn btn-md" onClick={p.onLoadDemo}>
            Demo-data laden
          </button>
        )}
      </section>
    </div>
  );
}

function CapRow({ m, weeks, plOf }: { m: Member; weeks: string[]; plOf: (mId: string, w: string) => number }) {
  return (
    <>
      <div className="cap-td cap-name">
        <span className="dot" style={{ width: 10, height: 10, background: m.color }} />
        {m.name}
      </div>
      {weeks.map((w) => {
        const cap = capOf(m, w);
        const pl = plOf(m.id, w);
        const r = cap ? pl / cap : pl ? 2 : 0;
        const st: CapState = !cap && !pl ? 'off' : r > 1.001 ? 'over' : r >= FULL_THRESHOLD ? 'full' : 'ok';
        return (
          <div key={w} className="cap-td" title={fmtH(pl) + ' van ' + fmtH(cap) + 'u'}>
            <span style={{ fontSize: 13, fontWeight: 700, color: st === 'ok' ? '#1E2E4B' : CAP_FG[st] }}>{cap ? Math.round(r * 100) + '%' : 'Afwezig'}</span>
            <div className="bar">
              <div style={{ width: Math.min(100, r * 100) + '%', background: CAP_BAR[st] }} />
            </div>
          </div>
        );
      })}
    </>
  );
}
