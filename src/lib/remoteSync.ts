import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import { applyToSnapshot, diff, fetchAll, snapshotOf, subscribe, writeChanges, type Snapshot } from './remote';
import { supabase } from './supabase';
import type { AppData } from './types';

const DEBOUNCE_MS = 300;
const RETRY_MS = 5000;

/**
 * Houdt de planning gelijk met Supabase: lokale wijzigingen worden (licht vertraagd)
 * weggeschreven, wijzigingen van collega's komen via realtime binnen.
 * Doet niets als `email` null is (lokale modus).
 */
export function useRemoteSync(data: AppData, setData: Dispatch<SetStateAction<AppData>>, email: string | null, toast: (msg: string) => void) {
  const synced = useRef<Snapshot | null>(null);
  // De startdata komt rechtstreeks uit de database, dus dat is wat er nu "opgeslagen" is.
  if (synced.current === null && email) synced.current = snapshotOf(data);
  const dataRef = useRef(data);
  dataRef.current = data;
  const chain = useRef<Promise<void>>(Promise.resolve());
  const failing = useRef(false);
  const retryTimer = useRef<number>();

  const flush = useCallback((): Promise<void> => {
    // Schrijfacties lopen na elkaar, zodat een oudere versie nooit een nieuwere overschrijft.
    chain.current = chain.current.then(async () => {
      const s = synced.current;
      if (!supabase || !email || !s) return;
      const c = diff(s, dataRef.current);
      if (!c) return;
      try {
        await writeChanges(supabase, c, email);
        applyToSnapshot(s, c);
        if (failing.current) {
          failing.current = false;
          toast('Verbinding hersteld. Alles is opgeslagen.');
        }
      } catch (err) {
        console.error('Opslaan mislukt', err);
        if (!failing.current) {
          failing.current = true;
          toast('Opslaan mislukt. We proberen het automatisch opnieuw.');
        }
        window.clearTimeout(retryTimer.current);
        retryTimer.current = window.setTimeout(() => void flush(), RETRY_MS);
      }
    });
    return chain.current;
  }, [email, toast]);

  // Elke wijziging: kort wachten (typen) en dan wegschrijven.
  useEffect(() => {
    if (!email) return;
    const t = window.setTimeout(() => void flush(), DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [data, email, flush]);

  useEffect(() => {
    if (!supabase || !email) return;
    const sb = supabase;
    const snap = () => synced.current!;

    const unsubscribe = subscribe(sb, {
      item: (id, obj) => {
        if (obj) {
          snap().items.set(id, obj);
          setData((d) => (d.items.some((i) => i.id === id) ? { ...d, items: d.items.map((i) => (i.id === id ? obj : i)) } : { ...d, items: [obj, ...d.items] }));
        } else {
          snap().items.delete(id);
          setData((d) => (d.items.some((i) => i.id === id) ? { ...d, items: d.items.filter((i) => i.id !== id) } : d));
        }
      },
      member: (id, obj) => {
        if (obj) {
          snap().members.set(id, obj);
          setData((d) => (d.members.some((m) => m.id === id) ? { ...d, members: d.members.map((m) => (m.id === id ? obj : m)) } : { ...d, members: [...d.members, obj] }));
        } else {
          snap().members.delete(id);
          setData((d) => (d.members.some((m) => m.id === id) ? { ...d, members: d.members.filter((m) => m.id !== id) } : d));
        }
      },
      project: (name, present) => {
        if (present) {
          snap().projects.add(name);
          setData((d) => (d.projects.includes(name) ? d : { ...d, projects: [...d.projects, name] }));
        } else {
          snap().projects.delete(name);
          setData((d) => (d.projects.includes(name) ? { ...d, projects: d.projects.filter((p) => p !== name) } : d));
        }
      },
      settings: (doc) => {
        snap().settings = JSON.stringify(doc);
        setData((d) => ({ ...d, ...doc }));
      },
      reconnected: async () => {
        // Tijdens de onderbreking kunnen we wijzigingen gemist hebben: eerst eigen werk opslaan, dan alles verversen.
        await flush();
        try {
          const fresh = await fetchAll(sb);
          if (!fresh) return;
          synced.current = snapshotOf(fresh);
          setData(fresh);
        } catch (err) {
          console.error('Verversen mislukt', err);
        }
      },
    });

    // Bij wegklikken of sluiten van het tabblad direct opslaan.
    const onHide = () => {
      if (document.visibilityState === 'hidden') void flush();
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onHide);
    return () => {
      unsubscribe();
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onHide);
      window.clearTimeout(retryTimer.current);
    };
  }, [email, flush, setData]);
}
