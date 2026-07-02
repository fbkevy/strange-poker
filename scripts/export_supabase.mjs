// Export the live Supabase ledger to data/backup.json (git backup).
// Used by .github/workflows/backup.yml; also runnable locally:
//   node scripts/export_supabase.mjs
// Reads creds from env vars, falling back to .env.local.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
let URL_ = process.env.SUPABASE_URL;
let KEY = process.env.SUPABASE_ANON_KEY;
if ((!URL_ || !KEY) && existsSync(join(root, ".env.local"))) {
  const env = readFileSync(join(root, ".env.local"), "utf-8");
  URL_ ??= env.match(/VITE_SUPABASE_URL=(.+)/)[1].trim();
  KEY ??= env.match(/VITE_SUPABASE_ANON_KEY=(.+)/)[1].trim();
}

async function rest(path) {
  const res = await fetch(`${URL_}/rest/v1/${path}`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
  });
  if (!res.ok) throw new Error(`GET ${path}: ${res.status} ${await res.text()}`);
  return res.json();
}

const events = await rest("events?select=*&order=src_row.asc.nullslast,date.asc");
const config = await rest("config?select=*");
writeFileSync(
  join(root, "data", "backup.json"),
  JSON.stringify({ exportedAt: new Date().toISOString(), config, events }, null, 2)
);
console.log(`backup.json written: ${events.length} events, ${config.length} config rows`);
