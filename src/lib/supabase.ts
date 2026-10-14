import { createClient } from '@supabase/supabase-js';

export const ALLOWED_DOMAIN = 'zibber.nl';

const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const key = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

/**
 * Supabase-client, of null als de omgevingsvariabelen ontbreken.
 * Zonder Supabase draait de app lokaal in de browser (handig voor ontwikkelen).
 */
export const supabase = url && key ? createClient(url, key, { auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }) : null;

export const isAllowedEmail = (email?: string | null) => !!email && email.toLowerCase().endsWith('@' + ALLOWED_DOMAIN);
