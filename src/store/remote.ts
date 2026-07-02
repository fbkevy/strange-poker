// SupabaseStore — same surface as LocalStore, backed by Postgres + realtime.
//
// Env model mirrors LocalStore:
// - prod events are visible in both envs; test additions only in test.
// - Undo of a same-env event flips its deleted_at column (atomic per row).
// - Undo of a PROD event while in TEST mode must not touch prod, so it goes
//   into a per-env tombstone map in the config table instead.
// - "Reset test" deletes test events and all test.* config keys.

import seed from "../../data/data.json";
import type { Config, LedgerEvent, PokerData } from "../types";
import type { Env } from "../engine/replay";
import { supabase } from "./supabase";
import { DEFAULT_HOUSE_RULES } from "./local";

type Row = {
  id: string; env: "prod" | "test"; date: string | null; type: string;
  block: "game" | "ledger"; note: string;
  deltas: Record<string, number>;
  chips: Record<string, number> | null;
  buyins: Record<string, number> | null;
  inputs: LedgerEvent["inputs"] | null;
  src_row: number | null; deleted_at: string | null;
};

const seedData = seed as unknown as PokerData;

function fromRow(r: Row): LedgerEvent {
  return {
    id: r.id, env: r.env, date: r.date, type: r.type as LedgerEvent["type"],
    block: r.block, note: r.note, deltas: r.deltas, chips: r.chips,
    buyins: r.buyins, inputs: r.inputs ?? undefined, deletedAt: r.deleted_at,
    ...(r.src_row != null ? { srcRow: r.src_row } : {}),
  } as LedgerEvent;
}

function toRow(e: LedgerEvent, env: Env): Partial<Row> {
  return {
    id: String(e.id), env, date: e.date, type: e.type, block: e.block,
    note: e.note, deltas: e.deltas, chips: e.chips, buyins: e.buyins,
    inputs: e.inputs ?? null, src_row: (e as any).srcRow ?? null,
    deleted_at: e.deletedAt ?? null,
  };
}

async function getConfigValue<T>(key: string): Promise<T | null> {
  const { data, error } = await supabase.from("config").select("value").eq("key", key).maybeSingle();
  if (error) throw error;
  return (data?.value as T) ?? null;
}

async function setConfigValue(key: string, value: unknown): Promise<void> {
  const { error } = await supabase.from("config").upsert({ key, value, updated_at: new Date().toISOString() });
  if (error) throw error;
}

export const SupabaseStore = {
  async getData(env: Env = "prod"): Promise<PokerData> {
    const query = supabase.from("events").select("*");
    const { data: rows, error } = env === "prod"
      ? await query.eq("env", "prod")
      : await query.in("env", ["prod", "test"]);
    if (error) throw error;

    const players = (await getConfigValue<string[]>("players")) ?? seedData.players;
    const config = {
      ...seedData.config,
      ...((await getConfigValue<Partial<Config>>(`${env}.config`)) ?? {}),
    };
    const tombs = env === "test"
      ? (await getConfigValue<Record<string, string>>("test.tombstones")) ?? {}
      : {};

    const events = (rows as Row[]).map(fromRow).map((e) =>
      tombs[String(e.id)] ? { ...e, deletedAt: tombs[String(e.id)] } : e
    );
    events.sort((a, b) => ((a as any).srcRow ?? 1e9) - ((b as any).srcRow ?? 1e9));
    return { players, config, events };
  },

  async addEvent(e: LedgerEvent, env: Env = "prod"): Promise<void> {
    const { error } = await supabase.from("events").insert(toRow(e, env));
    if (error) throw error;
  },

  async deleteEvent(id: string, env: Env = "prod"): Promise<void> {
    const when = new Date().toISOString();
    const { data, error } = await supabase.from("events").select("env").eq("id", String(id)).maybeSingle();
    if (error) throw error;
    if (data && data.env !== env) {
      // prod event undone from test mode: tombstone, don't touch prod
      const tombs = (await getConfigValue<Record<string, string>>(`${env}.tombstones`)) ?? {};
      tombs[String(id)] = when;
      await setConfigValue(`${env}.tombstones`, tombs);
    } else {
      const { error: e2 } = await supabase.from("events")
        .update({ deleted_at: when }).eq("id", String(id));
      if (e2) throw e2;
    }
  },

  async restoreEvent(id: string, env: Env = "prod"): Promise<void> {
    const tombs = (await getConfigValue<Record<string, string>>(`${env}.tombstones`)) ?? {};
    if (tombs[String(id)]) {
      delete tombs[String(id)];
      await setConfigValue(`${env}.tombstones`, tombs);
    } else {
      const { error } = await supabase.from("events")
        .update({ deleted_at: null }).eq("id", String(id));
      if (error) throw error;
    }
  },

  async getRules(env: Env = "prod"): Promise<string[]> {
    return (await getConfigValue<string[]>(`${env}.rules`)) ?? DEFAULT_HOUSE_RULES;
  },

  async saveRules(rules: string[], env: Env = "prod"): Promise<void> {
    await setConfigValue(`${env}.rules`, rules);
  },

  async saveConfig(config: Partial<Config>, env: Env = "prod"): Promise<void> {
    await setConfigValue(`${env}.config`, config);
  },

  async resetTest(): Promise<void> {
    const { error } = await supabase.from("events").delete().eq("env", "test");
    if (error) throw error;
    await supabase.from("config").delete().in("key",
      ["test.config", "test.rules", "test.tombstones"]);
  },

  /** Subscribe to remote changes; returns an unsubscribe fn. */
  subscribe(onChange: () => void): () => void {
    const ch = supabase
      .channel("sp-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "events" }, onChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "config" }, onChange)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  },
};
