// Core data model — shared by the store layer, engine, and UI.

export type PlayerId = string; // e.g. "Dec", "Pauli", ...

export type EventType =
  | "main" // €20 tournament (advances the handicap)
  | "after" // €5 after-game (flat, no handicap)
  | "in_person"
  | "bet" // side bet
  | "bonus" // straight flush / royal flush money bonus
  | "settle" // real money changing hands to clear balances
  | "misc"; // debts owed "for other reasons" (Rome, sweepstakes, …)

/** Raw wizard inputs for a game — the source of truth for derived numbers. */
export interface GameInputs {
  kind: "main" | "after";
  entrants: { player: PlayerId; rebuys: number }[];
  first: PlayerId[]; // >1 = split of 1st
  second?: PlayerId[]; // 6-player main games only
  noShows?: PlayerId[]; // regulars absent (counts toward loss streak)
  chipOverrides?: Record<PlayerId, number>; // manual stack corrections
}

/** A single zero-sum ledger row. `deltas` sums to 0 across all players. */
export interface LedgerEvent {
  id: string;
  env?: "prod" | "test"; // dataset; absent = prod (legacy import)
  date: string | null; // ISO date (UTC-safe). null when unknown (legacy rows)
  type: EventType;
  block: "game" | "ledger"; // poker-P&L vs other-debts (mirrors the sheet)
  note: string;
  deltas: Record<PlayerId, number>; // EUR
  chips: Record<PlayerId, number> | null; // main games: starting stacks
  buyins: Record<PlayerId, number> | null; // main games: rebuy counts
  /** Present on app-created games; legacy sheet rows have snapshots only. */
  inputs?: GameInputs;
  /** Soft delete (undo). Deleted events are ignored by all derivations. */
  deletedAt?: string | null;
  /** Row number in the original sheet (legacy imported events only). */
  srcRow?: number;
}

export interface Config {
  chipMin: number; // 6000
  chipMax: number; // 9000
  winDecrement: number; // 500
  secondDecrement: number; // 250
  lossIncrement: number; // 500
  lossStreakForIncrement: number; // 3
  mainEntry: number; // 20
  afterEntry: number; // 5
  secondPlaceShare: number; // 0.35
  straightFlushBonus: number; // 5
  royalFlushBonus: number; // 10
}

export interface PokerData {
  players: PlayerId[];
  config: Config;
  events: LedgerEvent[];
}
