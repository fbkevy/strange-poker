// LocalStore: bundled seed (data.json) + per-env localStorage overlay.
//
// - Two isolated datasets: "prod" and "test" (separate storage keys).
// - Both envs see the imported seed history; each env has its own added
//   events and its own tombstones (soft-deletes), so test mode can never
//   corrupt prod — and undo never mutates the seed itself.
// - "Reset test data" simply clears the test overlay + tombstones.

import seed from "../../data/data.json";
import type { LedgerEvent, PokerData } from "../types";
import type { Env } from "../engine/replay";
import { applyTombstones, type ListName, type Store, type Tombstones } from "./types";

const eventsKey = (env: Env) => `sp.${env}.events`;
const tombKey = (env: Env) => `sp.${env}.tombstones`;
const configKey = (env: Env) => `sp.${env}.config`;
const listKey = (name: ListName, env: Env) => `sp.${env}.${name}`;

/** House rules (informational, editable). Seeded from the sheet's notes. */
export const DEFAULT_HOUSE_RULES: string[] = [
  "Playing with 6: 2nd place gets 35% of the pot. Quick game: no 2nd place (just money back for 2nd).",
  "When achieving 2nd: decrement 250 chips next game.",
  "Each main-game rebuy counts as an extra loss toward the 3-loss chip increment (winners are exempt).",
  "Splitting a place splits its decrement (e.g. 500 → 250 each).",
  "First 2-7 of the session wins a bonus 500 chips from every other player (must show, hole cards only). 1,000 in the Quick game. Counts as a split for the handicap.",
  "Straight flush with the winning hand = €5 from each player.",
  "Unique royal flush to one person winning the hand: everyone at the table gives €10 each (even if not in the hand).",
];

/** Tips — free-form advice, empty until the lads add their own. */
export const DEFAULT_TIPS: string[] = [];

export const LIST_DEFAULTS: Record<ListName, string[]> = {
  rules: DEFAULT_HOUSE_RULES,
  tips: DEFAULT_TIPS,
};

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  localStorage.setItem(key, JSON.stringify(value));
}

/**
 * Events recorded on THIS DEVICE that were never written to the cloud, plus
 * any undo tombstones. Non-empty means unsynced work is at risk of being lost.
 */
export function pendingLocal(env: Env): {
  events: LedgerEvent[];
  tombstones: Tombstones;
  count: number;
} {
  const events = read<LedgerEvent[]>(eventsKey(env), []);
  const tombstones = read<Tombstones>(tombKey(env), {});
  return {
    events,
    tombstones,
    count: events.length + Object.keys(tombstones).length,
  };
}

/** Clear the local overlay after it has been successfully pushed to the cloud. */
export function clearPendingLocal(env: Env): void {
  localStorage.removeItem(eventsKey(env));
  localStorage.removeItem(tombKey(env));
}

export const LocalStore: Store = {
  async getData(env: Env = "prod"): Promise<PokerData> {
    const base = seed as unknown as PokerData;
    const overlay = read<LedgerEvent[]>(eventsKey(env), []);
    const tombs = read<Tombstones>(tombKey(env), {});
    const config = { ...base.config, ...read(configKey(env), {}) };
    return {
      ...base,
      config,
      events: applyTombstones([...base.events, ...overlay], tombs),
    };
  },

  async addEvent(e: LedgerEvent, env: Env = "prod"): Promise<void> {
    const overlay = read<LedgerEvent[]>(eventsKey(env), []);
    overlay.push({ ...e, env });
    write(eventsKey(env), overlay);
  },

  async deleteEvent(id: string, env: Env = "prod"): Promise<void> {
    const tombs = read<Tombstones>(tombKey(env), {});
    tombs[String(id)] = new Date().toISOString();
    write(tombKey(env), tombs);
  },

  async restoreEvent(id: string, env: Env = "prod"): Promise<void> {
    const tombs = read<Tombstones>(tombKey(env), {});
    delete tombs[String(id)];
    write(tombKey(env), tombs);
  },

  async getList(name: ListName, env: Env = "prod"): Promise<string[]> {
    return read<string[]>(listKey(name, env), LIST_DEFAULTS[name]);
  },

  async saveList(name: ListName, items: string[], env: Env = "prod"): Promise<void> {
    write(listKey(name, env), items);
  },

  async saveConfig(config, env: Env = "prod"): Promise<void> {
    write(configKey(env), config);
  },

  async resetTest(): Promise<void> {
    for (const k of [eventsKey("test"), tombKey("test"), configKey("test"),
      listKey("rules", "test"), listKey("tips", "test")]) {
      localStorage.removeItem(k);
    }
  },
};
