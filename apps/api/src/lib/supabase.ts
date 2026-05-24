import { createClient } from "@supabase/supabase-js";
import { config } from "../config.js";
import { WebSocket } from "ws";

// Polyfill WebSocket for Node.js 20
if (!globalThis.WebSocket) {
  (globalThis as any).WebSocket = WebSocket;
}

export const supabaseAdmin = createClient(config.supabase.url, config.supabase.serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});
