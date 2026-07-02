// Derived views over the ledger — pure, no I/O.

import type { LedgerEvent, PlayerId, PokerData } from "../types";
import { liveEvents } from "./replay";
import { year } from "../format";

const zero = (players: PlayerId[]): Record<PlayerId, number> =>
  Object.fromEntries(players.map((p) => [p, 0]));

function sumDeltas(players: PlayerId[], events: LedgerEvent[]): Record<PlayerId, number> {
  const acc = zero(players);
  for (const e of events) for (const p of players) acc[p] += e.deltas[p] ?? 0;
  return acc;
}

/** True running balance: sum of every live (non-deleted) event's delta. */
export function outstanding(data: PokerData): Record<PlayerId, number> {
  return sumDeltas(data.players, liveEvents(data.events));
}

/** Poker P&L (block === "game"), optionally filtered to a single year. */
export function pokerPnl(data: PokerData, yr?: number): Record<PlayerId, number> {
  const evs = liveEvents(data.events).filter(
    (e) => e.block === "game" && (yr == null || year(e.date) === yr)
  );
  return sumDeltas(data.players, evs);
}

/** Distinct years present in live game events, descending. */
export function gameYears(data: PokerData): number[] {
  const ys = new Set<number>();
  for (const e of liveEvents(data.events)) if (e.block === "game") {
    const y = year(e.date);
    if (y) ys.add(y);
  }
  return [...ys].sort((a, b) => b - a);
}

export interface HistoryRow extends LedgerEvent {}

/**
 * Events for the history table, newest first. Includes soft-deleted rows so
 * the UI can show them struck-through with a Restore action.
 */
export function history(data: PokerData): HistoryRow[] {
  return [...data.events].sort((a, b) => {
    const d = (b.date ?? "").localeCompare(a.date ?? "");
    return d !== 0 ? d : (b.srcRow ?? 0) - (a.srcRow ?? 0);
  });
}
