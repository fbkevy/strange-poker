// The storage contract both backends implement.

import type { Config, LedgerEvent, PokerData } from "../types";
import type { Env } from "../engine/replay";

export interface Store {
  getData(env?: Env): Promise<PokerData>;
  addEvent(e: LedgerEvent, env?: Env): Promise<void>;
  /** Soft-delete (undo) any event. */
  deleteEvent(id: string, env?: Env): Promise<void>;
  /** Restore a previously undone event. */
  restoreEvent(id: string, env?: Env): Promise<void>;
  getRules(env?: Env): Promise<string[]>;
  saveRules(rules: string[], env?: Env): Promise<void>;
  saveConfig(config: Partial<Config>, env?: Env): Promise<void>;
  /** Wipe everything the test env has diverged by. */
  resetTest(): Promise<void>;
  /** Subscribe to remote changes; returns unsubscribe. Absent on local. */
  subscribe?(onChange: () => void): () => void;
}

/** id -> deletedAt ISO map. Marks events deleted without mutating the source. */
export type Tombstones = Record<string, string>;

export function applyTombstones(
  events: LedgerEvent[],
  tombs: Tombstones
): LedgerEvent[] {
  return events.map((e) =>
    tombs[String(e.id)] ? { ...e, deletedAt: tombs[String(e.id)] } : e
  );
}
