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

/** A single zero-sum ledger row. `deltas` sums to 0 across all players. */
export interface LedgerEvent {
  id: string;
  date: string | null; // ISO date (UTC-safe). null when unknown (legacy rows)
  type: EventType;
  block: "game" | "ledger"; // poker-P&L vs other-debts (mirrors the sheet)
  note: string;
  deltas: Record<PlayerId, number>; // EUR
  chips: Record<PlayerId, number> | null; // main games: starting stacks
  buyins: Record<PlayerId, number> | null; // main games: rebuy counts
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
