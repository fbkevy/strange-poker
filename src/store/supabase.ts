// Supabase client for Strange Poker (SP).
// The anon/publishable key is browser-safe by design; access is governed by RLS
// (see supabase/schema.sql). Requires `npm i @supabase/supabase-js`.

import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!url || !anonKey) {
  // Falls back to LocalStore in the app when unset.
  console.warn("[SP] Supabase env not set; using local store.");
}

export const supabase = url && anonKey ? createClient(url, anonKey) : null;
