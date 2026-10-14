import { useEffect, useState, type CSSProperties, type InputHTMLAttributes, type ReactNode } from 'react';

export type Opt = string | { value: string; label: string };

export function Options({ list }: { list: Opt[] }) {
  return (
    <>
      {list.map((o) =>
        typeof o === 'string' ? (
          <option key={o} value={o}>
            {o}
          </option>
        ) : (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ),
      )}
    </>
  );
}

export function Field({ label, children, wide, style }: { label: ReactNode; children: ReactNode; wide?: boolean; style?: CSSProperties }) {
  return (
    <label className={'field' + (wide ? ' field-wide' : '')} style={style}>
      {label}
      {children}
    </label>
  );
}

const toText = (v: number | null | undefined) => (v == null ? '' : String(v));
const toNum = (t: string) => (t.trim() === '' ? null : Math.max(0, parseFloat(t.replace(',', '.')) || 0));

/**
 * Getalveld dat de getypte tekst lokaal vasthoudt, zodat tussenstanden als "1," niet
 * worden weggeschreven of overschreven. Elke geldige wijziging gaat direct naar `onValue`.
 */
export function NumberInput({
  value,
  onValue,
  ...rest
}: { value: number | null | undefined; onValue: (v: number | null) => void } & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'>) {
  const [text, setText] = useState(toText(value));
  useEffect(() => {
    if (toNum(text) !== (value ?? null)) setText(toText(value));
  }, [value]);
  return (
    <input
      {...rest}
      type="text"
      inputMode="decimal"
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        onValue(toNum(e.target.value));
      }}
    />
  );
}

export function Avatar({ color, initials, size = 34, fontSize }: { color: string; initials: string; size?: number; fontSize?: number }) {
  return (
    <span className="avatar" style={{ width: size, height: size, background: color, fontSize: fontSize ?? Math.round(size * 0.37) }}>
      {initials}
    </span>
  );
}

export function SrcTag({ source, small }: { source: string; small?: boolean }) {
  return <span className={'src-tag' + (small ? ' src-tag-sm' : '')}>{source === 'jira' ? 'Jira' : 'Handmatig'}</span>;
}

export function NewBadge({ small }: { small?: boolean }) {
  return <span className={'badge badge-new' + (small ? ' badge-sm' : '')}>Nieuw</span>;
}

export function SoftBadge({ children, small }: { children: ReactNode; small?: boolean }) {
  return <span className={'badge badge-soft' + (small ? ' badge-sm' : '')}>{children}</span>;
}

export function WarnDot({ text, size = 18 }: { text: string; size?: number }) {
  return (
    <span className="warn-dot" title={text} style={{ width: size, height: size, fontSize: Math.round(size * 0.6) }}>
      !
    </span>
  );
}

export function Dot({ color, size = 8, radius = '50%', style }: { color: string; size?: number; radius?: string | number; style?: CSSProperties }) {
  return <span className="dot" style={{ width: size, height: size, borderRadius: radius, background: color, ...style }} />;
}

export function Segmented<T extends string>({ options, value, onChange, small }: { options: [T, string][]; value: T; onChange: (v: T) => void; small?: boolean }) {
  return (
    <div className={'segmented' + (small ? ' segmented-sm' : '')}>
      {options.map(([k, l]) => (
        <button key={k} type="button" className={value === k ? 'active' : ''} onClick={() => onChange(k)}>
          {l}
        </button>
      ))}
    </div>
  );
}

export function Modal({ width, onClose, children }: { width: number; onClose: () => void; children: ReactNode }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ width: `min(${width}px, 100%)` }} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        {children}
      </div>
    </div>
  );
}

const URL_RE = /(https?:\/\/[^\s<>"')]+)/g;

/** Platte tekst met regelafbrekingen; webadressen worden klikbare links. */
export function LinkedText({ text, className }: { text: string; className?: string }) {
  const parts = text.split(URL_RE);
  return (
    <div className={className} style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
      {parts.map((p, k) =>
        k % 2 === 1 ? (
          <a key={k} href={p} target="_blank" rel="noopener noreferrer">
            {p}
          </a>
        ) : (
          p
        ),
      )}
    </div>
  );
}
