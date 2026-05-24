// Supabase browser client. We use the anon key + a JWT minted by our Render API
// (which validates Telegram initData server-side). RLS policies enforce that
// users can only read/write rows tied to their auth.uid().
import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  console.warn(
    "[novamine] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY — Supabase client will not work until you set them in apps/web/.env"
  );
}

export const supabase = createClient(url ?? "https://placeholder.supabase.co", anonKey ?? "placeholder", {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storageKey: "novamine.auth",
    // We sign in with a custom JWT minted by our API (not email/password)
    detectSessionInUrl: false,
  },
});

/**
 * Set the Supabase session using a JWT minted by our backend.
 * The JWT must be signed with the project's JWT secret so RLS can read auth.uid().
 */
export async function setSupabaseSession(accessToken, refreshToken) {
  const { data, error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken ?? accessToken, // refresh equals access for now; rotated later
  });
  if (error) throw error;
  return data;
}
