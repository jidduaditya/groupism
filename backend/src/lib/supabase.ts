import { createClient, SupabaseClient } from '@supabase/supabase-js';

let _client: SupabaseClient | null = null;

// Lazy init — allows health check to pass before env vars are configured
export function getSupabase(): SupabaseClient {
  if (_client) return _client;

  const url = process.env.SUPABASE_URL || process.env.SUPABASE_PROJECT_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;

  if (!url || !key) {
    throw new Error(
      `Missing Supabase env vars: ${!url ? 'SUPABASE_URL/SUPABASE_PROJECT_URL' : ''} ${!key ? 'SUPABASE_SERVICE_KEY' : ''}`.trim()
    );
  }

  _client = createClient(url, key);
  return _client;
}

// Convenience re-export for existing call sites
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    return (getSupabase() as any)[prop];
  },
});
