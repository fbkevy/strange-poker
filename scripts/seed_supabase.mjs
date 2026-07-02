// One-time seed: push data/data.json (players, config, 226 events) into Supabase.
// Run AFTER applying supabase/schema.sql in the dashboard SQL editor:
//   node scripts/seed_supabase.mjs
// Idempotent: upserts by id, so re-running is safe.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const env = readFileSync(join(root, ".env.local"), "utf-8");
const URL_ = env.match(/VITE_SUPABASE_URL=(.+)/)[1].trim();
const KEY = env.match(/VITE_SUPABASE_ANON_KEY=(.+)/)[1].trim();
const data = JSON.parse(readFileSync(join(root, "data", "data.json"), "utf-8"));

async function rest(path, method, body) {
  const res = await fetch(`${URL_}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: KEY, Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${await res.text()}`);
}

// config: players + prod defaults
await rest("config", "POST", [
  { key: "players", value: data.players },
  { key: "prod.config", value: data.config },
]);
console.log("config seeded");

// events in batches
const rows = data.events.map((e) => ({
  id: String(e.id), env: "prod", date: e.date, type: e.type, block: e.block,
  note: e.note, deltas: e.deltas, chips: e.chips, buyins: e.buyins,
  inputs: null, src_row: e.srcRow ?? null, deleted_at: null,
}));
for (let i = 0; i < rows.length; i += 100) {
  await rest("events", "POST", rows.slice(i, i + 100));
  console.log(`events ${Math.min(i + 100, rows.length)}/${rows.length}`);
}
console.log("done — Strange Poker is seeded");
