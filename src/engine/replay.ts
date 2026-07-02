// Replay core — the heart of event sourcing and perfect undo.
//
// The event log is the ONLY state. Chip proposals and loss streaks are derived
// by replaying main games chronologically through the rules engine. Undo is a
// soft delete: deleted events are simply excluded from replay, so everything
// they influenced (chips, streaks, totals) recomputes automatically.

import type {
  Config,
  GameInputs,
  LedgerEvent,
  PlayerId,
  PokerData,
} from "../types";
import { applyHandicap, computePayout, type Finish } from "./rules";

export type Env = "prod" | "test";

/**
 * Events that count: not soft-deleted. When `env` is given, also filter to
 * that env (missing env = prod). The store usually scopes env already, so
 * most callers omit it.
 */
export function liveEvents(events: LedgerEvent[], env?: Env): LedgerEvent[] {
  return events.filter(
    (e) => !e.deletedAt && (env == null || (e.env ?? "prod") === env)
  );
}

// ---------------------------------------------------------------------------
// Undo / restore
// ---------------------------------------------------------------------------

export function undoEvent(e: LedgerEvent, at: Date = new Date()): LedgerEvent {
  return { ...e, deletedAt: at.toISOString() };
}

export function restoreEvent(e: LedgerEvent): LedgerEvent {
  return { ...e, deletedAt: null };
}

// ---------------------------------------------------------------------------
// Game creation from wizard inputs
// ---------------------------------------------------------------------------

export interface BuildContext {
  id: string;
  date: string; // ISO date
  config: Config;
  players: PlayerId[];
  env?: Env;
  note?: string;
}

/**
 * Build a ledger event from raw game inputs. Money deltas are computed by the
 * payout engine; chips are NOT stored (they are derived on read by replay),
 * keeping the event undo-safe. The inputs travel with the event.
 */
export function buildGameEvent(inputs: GameInputs, ctx: BuildContext): LedgerEvent {
  const { deltas } = computePayout(
    inputs.entrants,
    { first: inputs.first, second: inputs.second },
    inputs.kind,
    ctx.config
  );
  return {
    id: ctx.id,
    env: ctx.env ?? "prod",
    date: ctx.date,
    type: inputs.kind,
    block: "game",
    note: ctx.note ?? "",
    deltas,
    chips: null,
    buyins: inputs.kind === "main"
      ? Object.fromEntries(inputs.entrants.map((e) => [e.player, e.rebuys]))
      : null,
    inputs,
  };
}

// ---------------------------------------------------------------------------
// Chip proposal by replay
// ---------------------------------------------------------------------------

export interface ChipProposal {
  chips: Record<PlayerId, number>;
  streaks: Record<PlayerId, number>;
  /** Per-player explanation of the latest adjustment. */
  reasons: Record<PlayerId, string>;
}

/** Derive each player's finish in a legacy (sheet) game from its money deltas. */
function legacyFinishes(e: LedgerEvent): Record<PlayerId, Finish> {
  const present = Object.keys(e.chips ?? {}).filter(
    (p) => e.chips![p] != null
  );
  const pool = present.length > 0 ? present : Object.keys(e.deltas);
  const d: Record<string, number> = {};
  for (const p of pool) d[p] = e.deltas[p] ?? 0;
  const max = Math.max(...pool.map((p) => d[p]));
  const finishes: Record<PlayerId, Finish> = {};
  for (const p of pool) {
    if (d[p] === max && d[p] > 0) finishes[p] = "win";
    else if (d[p] > 0) finishes[p] = "second";
    else finishes[p] = "loss";
  }
  return finishes;
}

/** Finishes for an app-created game, from its stored inputs. */
function inputFinishes(inputs: GameInputs): Record<PlayerId, Finish> {
  const finishes: Record<PlayerId, Finish> = {};
  for (const e of inputs.entrants) finishes[e.player] = "loss";
  for (const p of inputs.second ?? []) finishes[p] = "second";
  for (const p of inputs.first) finishes[p] = "win";
  for (const p of inputs.noShows ?? []) finishes[p] = "absent";
  return finishes;
}

/**
 * Propose starting stacks + streaks for the NEXT main game by replaying all
 * live main games in date order.
 *
 * - Legacy rows carry chip snapshots (what was actually played): the snapshot
 *   resets that player's running stack, then the game's result applies.
 * - App-created rows carry inputs: the result applies to the running stacks.
 * - `chipOverrides` on inputs force a player's stack after that game.
 */
export function proposeNextChips(data: PokerData, env?: Env): ChipProposal {
  const cfg = data.config;
  const mains = liveEvents(data.events, env)
    .filter((e) => e.type === "main")
    .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));

  let chips: Record<PlayerId, number> = {};
  let streaks: Record<PlayerId, number> = {};
  let reasons: Record<PlayerId, string> = {};

  for (const e of mains) {
    // Legacy snapshot: trust the recorded starting stacks for that game.
    if (e.chips) {
      for (const p of Object.keys(e.chips)) {
        if (e.chips[p] != null) chips[p] = e.chips[p]!;
      }
    }

    const finishes = e.inputs ? inputFinishes(e.inputs) : legacyFinishes(e);
    const firstCount = Object.values(finishes).filter((f) => f === "win").length;
    const secondCount = Object.values(finishes).filter((f) => f === "second").length;

    // Rebuys count as loss-strikes: from wizard inputs, or legacy buyin columns.
    const rebuys: Record<PlayerId, number> = {};
    if (e.inputs) {
      for (const en of e.inputs.entrants) rebuys[en.player] = en.rebuys;
    } else if (e.buyins) {
      for (const [p, n] of Object.entries(e.buyins)) rebuys[p] = Number(n) || 0;
    }

    const out = applyHandicap(
      {
        currentChips: chips,
        finishes,
        lossStreaks: streaks,
        rebuys,
        firstCount: Math.max(1, firstCount),
        secondCount: Math.max(1, secondCount),
      },
      cfg
    );
    chips = { ...chips, ...out.nextChips };
    streaks = { ...streaks, ...out.nextStreaks };
    reasons = { ...reasons, ...out.reasons };

    // Manual corrections recorded with the game win over computed values.
    if (e.inputs?.chipOverrides) {
      for (const [p, v] of Object.entries(e.inputs.chipOverrides)) {
        chips[p] = v;
        reasons[p] = "manual override";
      }
    }
  }

  return { chips, streaks, reasons };
}
