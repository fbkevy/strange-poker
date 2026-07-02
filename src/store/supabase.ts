// Supabase client for Strange Poker (SP).
// The publishable (anon) key is browser-safe by design and ships in the site
// bundle regardless, so committing it here adds no exposure. Access control is
// RLS (currently open to the key — friends-only app; see supabase/schema.sql).

import { createClient } from "@supabase/supabase-js";

const url =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) ??
  "https://pkauqxtldnaorajuephr.supabase.co";
const anonKey =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ??
  "sb_publishable_N4YUJRPsdrnj79gRO7HN7Q_3FehQYBJ";

export const supabase = createClient(url, anonKey);
