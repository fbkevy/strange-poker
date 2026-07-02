// Store selection: Supabase when reachable, LocalStore otherwise.
// The app calls resolveStore() once at startup; if the DB is missing or
// unreachable it degrades to the bundled-seed + localStorage store so the
// site keeps working offline.

import { LocalStore } from "./local";
import { SupabaseStore } from "./remote";

export type Store = typeof LocalStore & {
  subscribe?: (onChange: () => void) => () => void;
};

export interface ResolvedStore {
  store: Store;
  mode: "cloud" | "local";
}

export async function resolveStore(): Promise<ResolvedStore> {
  try {
    const probe = await SupabaseStore.getData("prod");
    if (probe.events.length > 0) {
      return { store: SupabaseStore as unknown as Store, mode: "cloud" };
    }
    console.warn("[SP] Supabase reachable but empty — run the seed script; using local store.");
  } catch (err) {
    console.warn("[SP] Supabase unavailable, using local store:", err);
  }
  return { store: LocalStore as Store, mode: "local" };
}
