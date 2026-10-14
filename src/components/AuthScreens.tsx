import { useState, type ReactNode } from 'react';
import { ALLOWED_DOMAIN } from '../lib/supabase';
import type { AppData } from '../lib/types';

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <div className="auth-brand-name">zibber</div>
          <div className="auth-brand-sub">Marketingplanning</div>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Splash({ text = 'Planning laden…' }: { text?: string }) {
  return (
    <Shell>
      <div className="auth-loading">
        <span className="spinner" />
        {text}
      </div>
    </Shell>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

export function Login({ error, onLogin }: { error: string | null; onLogin: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  return (
    <Shell>
      <div className="auth-text">
        <h1>Inloggen</h1>
        <p>Log in met je Google-account van Zibber.</p>
      </div>
      {error && <div className="auth-error">{error}</div>}
      <button
        type="button"
        className="google-btn"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await onLogin();
          } finally {
            setBusy(false);
          }
        }}
      >
        <GoogleIcon />
        {busy ? 'Doorsturen naar Google…' : 'Inloggen met Google'}
      </button>
      <p className="auth-foot">Alleen voor medewerkers met een @{ALLOWED_DOMAIN}-account.</p>
    </Shell>
  );
}

export function ErrorScreen({ message, onRetry, onSignOut }: { message: string; onRetry: () => void; onSignOut: () => void }) {
  return (
    <Shell>
      <div className="auth-text">
        <h1>Er ging iets mis</h1>
        <p>{message}</p>
      </div>
      <div className="auth-actions">
        <button type="button" className="btn btn-lg btn-primary" onClick={onRetry}>
          Opnieuw proberen
        </button>
        <button type="button" className="link-btn link-muted" onClick={onSignOut}>
          Uitloggen
        </button>
      </div>
    </Shell>
  );
}

export type SetupChoice = 'local' | 'demo' | 'empty';

/** Eerste keer: de database is nog leeg. */
export function Setup({ local, onChoose }: { local: AppData | null; onChoose: (c: SetupChoice) => Promise<void> }) {
  const [busy, setBusy] = useState<SetupChoice | null>(null);
  const [error, setError] = useState('');
  const choose = async (c: SetupChoice) => {
    setBusy(c);
    setError('');
    try {
      await onChoose(c);
    } catch (err) {
      setError('Opslaan in de database is mislukt: ' + (err instanceof Error ? err.message : String(err)));
      setBusy(null);
    }
  };
  const option = (c: SetupChoice, title: string, sub: string) => (
    <button type="button" className="setup-option" disabled={!!busy} onClick={() => choose(c)}>
      <span className="setup-option-title">{busy === c ? 'Bezig…' : title}</span>
      <span className="muted">{sub}</span>
    </button>
  );
  return (
    <Shell>
      <div className="auth-text">
        <h1>Welkom</h1>
        <p>De gedeelde planning is nog leeg. Waarmee wil je beginnen?</p>
      </div>
      {error && <div className="auth-error">{error}</div>}
      <div className="setup-options">
        {local && option('local', 'Gegevens uit deze browser overnemen', `${local.items.length} taken en ${local.members.length} teamleden die je eerder in deze browser hebt ingevoerd.`)}
        {option('demo', 'Starten met demo-data', 'Voorbeeldteam en -taken. Je wist ze later via Team & capaciteit.')}
        {option('empty', 'Leeg beginnen', 'Zonder teamleden of taken.')}
      </div>
    </Shell>
  );
}
