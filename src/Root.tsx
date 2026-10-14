import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { useCallback, useEffect, useState } from 'react';
import App, { type Account } from './App';
import { ErrorScreen, Login, Setup, Splash, type SetupChoice } from './components/AuthScreens';
import { DEFAULT_SETTINGS, freshData } from './lib/demo';
import { diff, emptySnapshot, fetchAll, writeChanges } from './lib/remote';
import { loadLocal, readLocal } from './lib/store';
import { ALLOWED_DOMAIN, isAllowedEmail, supabase } from './lib/supabase';
import type { AppData } from './lib/types';

const NOT_ALLOWED = `Alleen @${ALLOWED_DOMAIN}-accounts hebben toegang. Log in met je Zibber-account.`;

/** Foutmelding die Supabase/Google na het inloggen in de URL meegeeft. Ruimt de URL daarna op. */
function takeUrlError(): string | null {
  const params = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const raw = params.get('error_description') || hash.get('error_description') || params.get('error') || hash.get('error');
  if (!raw) return null;
  window.history.replaceState(null, '', window.location.pathname);
  if (/zibber|403|database error saving new user|signups? not allowed/i.test(raw)) return NOT_ALLOWED;
  return 'Inloggen is niet gelukt: ' + raw.replace(/\+/g, ' ');
}

export default function Root() {
  if (!supabase) return <App initial={loadLocal()} backend={{ kind: 'local' }} />;
  return <RemoteRoot sb={supabase} />;
}

function RemoteRoot({ sb }: { sb: SupabaseClient }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [authError, setAuthError] = useState<string | null>(takeUrlError);

  useEffect(() => {
    sb.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = sb.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, [sb]);

  const email = session?.user.email || null;
  const allowed = isAllowedEmail(email);

  // Ingelogd met een ander domein: direct weer uitloggen.
  useEffect(() => {
    if (session && !allowed) {
      setAuthError(NOT_ALLOWED);
      void sb.auth.signOut();
    }
  }, [sb, session, allowed]);

  const login = async () => {
    setAuthError(null);
    const { error } = await sb.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + window.location.pathname, queryParams: { prompt: 'select_account' } },
    });
    if (error) setAuthError('Inloggen is niet gelukt: ' + error.message);
  };

  if (session === undefined) return <Splash text="Even geduld…" />;
  if (!session || !allowed || !email) return <Login error={authError} onLogin={login} />;

  const meta = session.user.user_metadata || {};
  const account: Account = { email, name: meta.full_name || meta.name || email, onSignOut: () => void sb.auth.signOut() };
  return <Workspace key={session.user.id} sb={sb} account={account} />;
}

const describeError = (err: unknown) => {
  const msg = err instanceof Error ? err.message : typeof err === 'object' && err && 'message' in err ? String((err as { message: unknown }).message) : String(err);
  if (/does not exist|schema cache|could not find the table/i.test(msg)) {
    return 'De tabellen bestaan nog niet in Supabase. Voer eerst supabase/schema.sql uit in de SQL Editor van Supabase.';
  }
  if (/failed to fetch|network/i.test(msg)) return 'Geen verbinding met de database. Controleer je internetverbinding.';
  return 'De planning kon niet worden geladen: ' + msg;
};

type Phase = { s: 'loading' } | { s: 'setup' } | { s: 'ready'; data: AppData } | { s: 'error'; message: string };

function Workspace({ sb, account }: { sb: SupabaseClient; account: Account }) {
  const [phase, setPhase] = useState<Phase>({ s: 'loading' });

  const load = useCallback(async () => {
    setPhase({ s: 'loading' });
    try {
      const data = await fetchAll(sb);
      setPhase(data ? { s: 'ready', data } : { s: 'setup' });
    } catch (err) {
      console.error(err);
      setPhase({ s: 'error', message: describeError(err) });
    }
  }, [sb]);

  useEffect(() => {
    void load();
  }, [load]);

  const setup = async (choice: SetupChoice) => {
    const empty: AppData = { members: [], items: [], projects: [], settings: { ...DEFAULT_SETTINGS, demoSim: false }, syncIdx: 0, lastSync: new Date().toISOString() };
    const start = choice === 'local' ? readLocal() || empty : choice === 'demo' ? freshData() : empty;
    const changes = diff(emptySnapshot(), start);
    if (changes) await writeChanges(sb, changes, account.email);
    await load();
  };

  if (phase.s === 'loading') return <Splash />;
  if (phase.s === 'error') return <ErrorScreen message={phase.message} onRetry={load} onSignOut={account.onSignOut} />;
  if (phase.s === 'setup') return <Setup local={readLocal()} onChoose={setup} />;
  return <App initial={phase.data} backend={{ kind: 'remote', email: account.email }} account={account} />;
}
