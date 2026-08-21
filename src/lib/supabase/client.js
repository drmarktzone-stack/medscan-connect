/**
 * Supabase REST client for DoctorPedAI live data.
 * Patient records never go to GitHub. If env is missing, callers use local fallback.
 */

export function getSupabaseConfig() {
  const url = String(import.meta.env?.VITE_SUPABASE_URL || '').replace(/\/$/, '');
  const anonKey = String(
    import.meta.env?.VITE_SUPABASE_ANON_KEY ||
      import.meta.env?.VITE_SUPABASE_PUBLISHABLE_KEY ||
      '',
  );
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

export function isSupabaseConfigured() {
  return Boolean(getSupabaseConfig());
}

export async function supabaseRest(path, { method = 'GET', body, headers = {} } = {}) {
  const cfg = getSupabaseConfig();
  if (!cfg) {
    return { ok: false, reason: 'supabase_env_missing' };
  }
  const res = await fetch(`${cfg.url}/rest/v1/${path.replace(/^\//, '')}`, {
    method,
    headers: {
      apikey: cfg.anonKey,
      Authorization: `Bearer ${cfg.anonKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...headers,
    },
    body: body == null ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
  if (!res.ok) {
    return { ok: false, reason: 'supabase_http', status: res.status, error: json };
  }
  return { ok: true, data: json };
}
