import { createClient } from '@supabase/supabase-js';

export const ALLOWED_DOMAIN = 'zibber.nl';

/** Alleen het basisadres (https://xxx.supabase.co), ook als er per ongeluk /rest/v1/ of een slash achter staat. */
function baseUrl(raw?: string) {
  const v = raw?.trim();
  if (!v) return undefined;
  try {
    return new URL(v.includes('://') ? v : 'https://' + v).origin;
  } catch {
    return v;
  }
}

const url = baseUrl(import.meta.env.VITE_SUPABASE_URL);
const key = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

/**
 * Supabase-client, of null als de omgevingsvariabelen ontbreken.
 * Zonder Supabase draait de app lokaal in de browser (handig voor ontwikkelen).
 */
export const supabase = url && key ? createClient(url, key, { auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }) : null;

export const isAllowedEmail = (email?: string | null) => !!email && email.toLowerCase().endsWith('@' + ALLOWED_DOMAIN);
