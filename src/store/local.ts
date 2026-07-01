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

const eventsKey = (env: Env) => `sp.${env}.events`;
const tombKey = (env: Env) => `sp.${env}.tombstones`;

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

/** id -> deletedAt ISO. Applies soft-deletes to seed events non-destructively. */
type Tombstones = Record<string, string>;

export const LocalStore = {
  async getData(env: Env = "prod"): Promise<PokerData> {
    const base = seed as unknown as PokerData;
    const overlay = read<LedgerEvent[]>(eventsKey(env), []);
    const tombs = read<Tombstones>(tombKey(env), {});

    const events = [
      ...base.events.map((e) =>
        tombs[String(e.id)] ? { ...e, deletedAt: tombs[String(e.id)] } : e
      ),
      ...overlay.map((e) =>
        tombs[String(e.id)] ? { ...e, deletedAt: tombs[String(e.id)] } : e
      ),
    ];
    return { ...base, events };
  },

  async addEvent(e: LedgerEvent, env: Env = "prod"): Promise<void> {
    const overlay = read<LedgerEvent[]>(eventsKey(env), []);
    overlay.push({ ...e, env });
    write(eventsKey(env), overlay);
  },

  /** Soft-delete (undo) any event — seed or app-created. */
  async deleteEvent(id: string, env: Env = "prod"): Promise<void> {
    const tombs = read<Tombstones>(tombKey(env), {});
    tombs[String(id)] = new Date().toISOString();
    write(tombKey(env), tombs);
  },

  /** Restore a previously undone event. */
  async restoreEvent(id: string, env: Env = "prod"): Promise<void> {
    const tombs = read<Tombstones>(tombKey(env), {});
    delete tombs[String(id)];
    write(tombKey(env), tombs);
  },

  /** Wipe everything the test env has diverged by (added events + undos). */
  async resetTest(): Promise<void> {
    localStorage.removeItem(eventsKey("test"));
    localStorage.removeItem(tombKey("test"));
  },
};

export type Store = typeof LocalStore;
