// Pure rules engine: payout + handicap. No I/O, fully unit-testable.
// Encodes the confirmed (note-based) rules — see PLAN.md.

import type { Config, PlayerId } from "../types";

// ---------------------------------------------------------------------------
// Payout
// ---------------------------------------------------------------------------

export interface Entrant {
  player: PlayerId;
  rebuys: number; // number of rebuys (0+); total outlay = entry * (1 + rebuys)
}

export interface GameResult {
  /** Players finishing 1st. More than one => a split of 1st place. */
  first: PlayerId[];
  /** Players finishing 2nd (6-player main games only). Usually 0 or 1. */
  second?: PlayerId[];
}

export type GameKind = "main" | "after";

/** Round to the nearest `step` euros, defaulting to whole euros. */
function roundTo(x: number, step = 1): number {
  return Math.round(x / step) * step;
}

/**
 * Compute the pot, each player's winnings, and the zero-sum money deltas.
 * - after (€5): 1st only, winner takes the pot (no 2nd).
 * - main, 6 payers: 65% to 1st, 35% to 2nd.
 * - main, <6 payers: winner-takes-all.
 * A split of a place shares that place's prize equally.
 * Deltas are rounded to whole euros and rebalanced so they sum to exactly 0.
 */
export function computePayout(
  entrants: Entrant[],
  result: GameResult,
  kind: GameKind,
  config: Config
): { pot: number; deltas: Record<PlayerId, number> } {
  const entry = kind === "main" ? config.mainEntry : config.afterEntry;
  const outlay: Record<PlayerId, number> = {};
  for (const e of entrants) outlay[e.player] = entry * (1 + Math.max(0, e.rebuys));
  const pot = Object.values(outlay).reduce((a, b) => a + b, 0);
  const payers = entrants.length;

  const winnings: Record<PlayerId, number> = {};
  for (const e of entrants) winnings[e.player] = 0;

  const first = result.first;
  const second = result.second ?? [];

  const useSecond = kind === "main" && payers === 6 && second.length > 0;
  if (useSecond) {
    const firstPrize = (1 - config.secondPlaceShare) * pot; // 65%
    const secondPrize = config.secondPlaceShare * pot; // 35%
    for (const p of first) winnings[p] += firstPrize / first.length;
    for (const p of second) winnings[p] += secondPrize / second.length;
  } else {
    for (const p of first) winnings[p] += pot / first.length;
  }

  // Net deltas, rounded, then rebalanced to sum to exactly zero.
  const deltas: Record<PlayerId, number> = {};
  for (const e of entrants) deltas[e.player] = roundTo(winnings[e.player] - outlay[e.player]);
  rebalanceToZero(deltas, first[0]);
  return { pot, deltas };
}

/** Nudge the largest winner's delta so the map sums to exactly zero. */
function rebalanceToZero(deltas: Record<PlayerId, number>, sink: PlayerId): void {
  const sum = Object.values(deltas).reduce((a, b) => a + b, 0);
  if (sum !== 0) deltas[sink] -= sum;
}

// ---------------------------------------------------------------------------
// Handicap
// ---------------------------------------------------------------------------

export type Finish = "win" | "second" | "loss" | "absent";

export interface HandicapInput {
  /** Starting stacks used in the game just played. */
  currentChips: Record<PlayerId, number>;
  /** Each regular's finish this game (absent = no-show, counts as a loss). */
  finishes: Record<PlayerId, Finish>;
  /** Consecutive-loss streak per player BEFORE this game. */
  lossStreaks: Record<PlayerId, number>;
  /** Rebuys taken this game; each counts as an extra loss-strike for losers. */
  rebuys?: Record<PlayerId, number>;
  /** Number of players who split 1st / 2nd, for splitting the decrement. */
  firstCount: number;
  secondCount: number;
}

export interface HandicapOutput {
  nextChips: Record<PlayerId, number>;
  nextStreaks: Record<PlayerId, number>;
  /** Human-readable reason per player, for the "chips for next game" screen. */
  reasons: Record<PlayerId, string>;
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

/**
 * Apply one MAIN game's result to the handicap. €5/after games never call this.
 * - win: −winDecrement (shared if 1st was split).
 * - second: −secondDecrement (shared if 2nd was split).
 * - loss/absent: streak +1, plus +1 per rebuy taken; on reaching
 *   lossStreakForIncrement, +lossIncrement and reset the streak.
 *   Winners and 2nd reset their streak to 0 (rebuys don't count against them).
 * - every result is clamped to [chipMin, chipMax].
 */
export function applyHandicap(input: HandicapInput, config: Config): HandicapOutput {
  const nextChips: Record<PlayerId, number> = {};
  const nextStreaks: Record<PlayerId, number> = {};
  const reasons: Record<PlayerId, string> = {};

  for (const p of Object.keys(input.finishes)) {
    const cur = input.currentChips[p] ?? config.chipMax;
    const finish = input.finishes[p];
    let next = cur;
    let streak = input.lossStreaks[p] ?? 0;
    let reason = "no change";

    if (finish === "win") {
      const dec = config.winDecrement / Math.max(1, input.firstCount);
      next = cur - dec;
      streak = 0;
      reason = `won → −${dec}`;
    } else if (finish === "second") {
      const dec = config.secondDecrement / Math.max(1, input.secondCount);
      next = cur - dec;
      streak = 0;
      reason = `2nd → −${dec}`;
    } else {
      // loss or absent: the loss itself + one strike per rebuy taken
      streak += 1 + Math.max(0, input.rebuys?.[p] ?? 0);
      if (streak >= config.lossStreakForIncrement) {
        next = cur + config.lossIncrement;
        streak = 0;
        reason = `lost ${config.lossStreakForIncrement} → +${config.lossIncrement}`;
      } else {
        reason = `loss ${streak}/${config.lossStreakForIncrement}`;
      }
    }

    const clamped = clamp(next, config.chipMin, config.chipMax);
    if (clamped !== next) reason += ` (clamped ${config.chipMin}–${config.chipMax})`;
    nextChips[p] = clamped;
    nextStreaks[p] = streak;
    reasons[p] = reason;
  }

  return { nextChips, nextStreaks, reasons };
}
