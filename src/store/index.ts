// Store selection.
//
// IMPORTANT: a cloud failure is NEVER silent. The app once fell back to the
// device-local store with only a console warning, so a whole poker night was
// recorded into localStorage and looked saved. Now the failure is surfaced to
// the UI (red banner, explicit "device only" save confirmations) and any
// unsynced local work is offered for push as soon as the cloud returns.

import { LocalStore, pendingLocal, clearPendingLocal } from "./local";
import { SupabaseStore } from "./remote";
import type { Store } from "./types";
import type { Env } from "../engine/replay";

export type { Store } from "./types";

export interface ResolvedStore {
  store: Store;
  mode: "cloud" | "offline";
  /** Human-readable reason, only when mode === "offline". */
  error?: string;
  /** True when the failure looks like a paused/sleeping free-tier project. */
  likelyPaused?: boolean;
}

/** Turn whatever Supabase threw into a sentence a human can act on. */
function describe(err: unknown): { message: string; likelyPaused: boolean } {
  const raw =
    err instanceof Error ? err.message :
    typeof err === "object" && err && "message" in err ? String((err as any).message) :
    String(err);

  // Paused projects fail DNS/TCP (TypeError: Failed to fetch) or answer 5xx.
  const paused =
    /failed to fetch|networkerror|load failed|503|502|540|upstream|unavailable/i.test(raw);
  return {
    message: paused
      ? `Database unreachable (${raw}). The Supabase project is probably paused — open the Supabase dashboard and resume it.`
      : `Database error: ${raw}`,
    likelyPaused: paused,
  };
}

export async function resolveStore(): Promise<ResolvedStore> {
  try {
    const probe = await SupabaseStore.getData("prod");
    if (probe.events.length === 0) {
      return {
        store: LocalStore,
        mode: "offline",
        error: "The cloud database is reachable but EMPTY — nothing would be saved against real history. Run the seed script before recording anything.",
        likelyPaused: false,
      };
    }
    return { store: SupabaseStore, mode: "cloud" };
  } catch (err) {
    const { message, likelyPaused } = describe(err);
    console.error("[SP] CLOUD UNAVAILABLE — entries will NOT be shared:", err);
    return { store: LocalStore, mode: "offline", error: message, likelyPaused };
  }
}

export interface SyncResult {
  pushed: number;
  failed: { id: string; error: string }[];
}

/**
 * Push everything recorded on this device while the cloud was down, then clear
 * the local overlay. Safe to re-run: a failed row stays local for a retry.
 */
export async function pushPendingToCloud(env: Env): Promise<SyncResult> {
  const { events, tombstones } = pendingLocal(env);
  const failed: SyncResult["failed"] = [];
  let pushed = 0;

  for (const e of events) {
    try {
      await SupabaseStore.addEvent(e, env);
      pushed++;
    } catch (err) {
      failed.push({ id: String(e.id), error: String(err) });
    }
  }
  for (const id of Object.keys(tombstones)) {
    try {
      await SupabaseStore.deleteEvent(id, env);
      pushed++;
    } catch (err) {
      failed.push({ id, error: String(err) });
    }
  }

  // Only discard the local copy once everything landed.
  if (failed.length === 0) clearPendingLocal(env);
  return { pushed, failed };
}

export { pendingLocal } from "./local";
