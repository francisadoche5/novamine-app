// Server-side Supabase client using the service role key.
// Bypasses RLS — only used by trusted backend code.
import { createClient } from "@supabase/supabase-js";
import { config } from "../config.js";

export const supabaseAdmin = createClient(config.supabase.url, config.supabase.serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});
