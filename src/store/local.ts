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
import { applyTombstones, type Store, type Tombstones } from "./types";

const eventsKey = (env: Env) => `sp.${env}.events`;
const tombKey = (env: Env) => `sp.${env}.tombstones`;
const configKey = (env: Env) => `sp.${env}.config`;
const rulesKey = (env: Env) => `sp.${env}.rules`;

/** House rules (informational, editable). Seeded from the sheet's notes. */
export const DEFAULT_HOUSE_RULES: string[] = [
  "Playing with 6: 2nd place gets 35% of the pot. €5 game: no 2nd place (just money back for 2nd).",
  "When achieving 2nd: decrement 250 chips next game.",
  "Each main-game rebuy counts as an extra loss toward the 3-loss chip increment (winners are exempt).",
  "Splitting a place splits its decrement (e.g. 500 → 250 each).",
  "First 2-7 of the session wins a bonus 500 chips from every other player (must show, hole cards only). 1,000 in the €5 game. Counts as a split for the handicap.",
  "Straight flush with the winning hand = €5 from each player.",
  "Unique royal flush to one person winning the hand: everyone at the table gives €10 each (even if not in the hand).",
];

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

  async getRules(env: Env = "prod"): Promise<string[]> {
    return read<string[]>(rulesKey(env), DEFAULT_HOUSE_RULES);
  },

  async saveRules(rules: string[], env: Env = "prod"): Promise<void> {
    write(rulesKey(env), rules);
  },

  async saveConfig(config, env: Env = "prod"): Promise<void> {
    write(configKey(env), config);
  },

  async resetTest(): Promise<void> {
    for (const k of [eventsKey("test"), tombKey("test"), configKey("test"), rulesKey("test")]) {
      localStorage.removeItem(k);
    }
  },
};
