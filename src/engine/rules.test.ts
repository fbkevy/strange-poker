import { describe, it, expect } from "vitest";
import { applyHandicap, computePayout, type Entrant } from "./rules";
import type { Config } from "../types";

const config: Config = {
  chipMin: 6000, chipMax: 9000,
  winDecrement: 500, secondDecrement: 250,
  lossIncrement: 500, lossStreakForIncrement: 3,
  mainEntry: 20, afterEntry: 5,
  secondPlaceShare: 0.35,
  straightFlushBonus: 5, royalFlushBonus: 10,
};

const roster = (players: string[], rebuys: Record<string, number> = {}): Entrant[] =>
  players.map((p) => ({ player: p, rebuys: rebuys[p] ?? 0 }));

describe("computePayout", () => {
  it("5-player main: winner takes all, zero-sum", () => {
    const { pot, deltas } = computePayout(
      roster(["Dec", "Pauli", "Kev", "Caoimh", "Dave"]),
      { first: ["Kev"] }, "main", config);
    expect(pot).toBe(100);
    expect(deltas.Kev).toBe(80);
    expect(deltas.Dec).toBe(-20);
    expect(Object.values(deltas).reduce((a, b) => a + b, 0)).toBe(0);
  });

  it("6-player main: 65/35 split, zero-sum", () => {
    const { pot, deltas } = computePayout(
      roster(["Dec", "Pauli", "Kev", "Caoimh", "Dave", "Fran"]),
      { first: ["Kev"], second: ["Dec"] }, "main", config);
    expect(pot).toBe(120);
    // 65% of 120 = 78 → −20 outlay = 58 ; 35% = 42 → −20 = 22
    expect(deltas.Kev).toBe(58);
    expect(deltas.Dec).toBe(22);
    expect(Object.values(deltas).reduce((a, b) => a + b, 0)).toBe(0);
  });

  it("rebuys grow the pot", () => {
    const { pot } = computePayout(
      roster(["Dec", "Kev", "Dave"], { Kev: 2 }), { first: ["Dec"] }, "main", config);
    expect(pot).toBe(20 * 1 + 20 * 3 + 20 * 1); // Dec 20, Kev 60, Dave 20
  });

  it("€5 after-game: 1st only, no 2nd", () => {
    const { pot, deltas } = computePayout(
      roster(["Dec", "Pauli", "Kev", "Caoimh", "Dave", "Fran"]),
      { first: ["Fran"], second: ["Dec"] }, "after", config);
    expect(pot).toBe(30);
    expect(deltas.Fran).toBe(25); // takes whole pot despite 6 players
    expect(deltas.Dec).toBe(-5);
  });

  it("split of 1st shares the prize", () => {
    const { deltas } = computePayout(
      roster(["Dec", "Kev", "Caoimh", "Dave"]),
      { first: ["Kev", "Caoimh"] }, "main", config);
    expect(deltas.Kev).toBe(deltas.Caoimh);
    expect(Object.values(deltas).reduce((a, b) => a + b, 0)).toBe(0);
  });
});

describe("applyHandicap", () => {
  const base = { firstCount: 1, secondCount: 1 };

  it("winner drops 500, streak resets", () => {
    const out = applyHandicap({
      ...base,
      currentChips: { Kev: 7000 },
      finishes: { Kev: "win" },
      lossStreaks: { Kev: 2 },
    }, config);
    expect(out.nextChips.Kev).toBe(6500);
    expect(out.nextStreaks.Kev).toBe(0);
  });

  it("2nd drops 250", () => {
    const out = applyHandicap({
      ...base,
      currentChips: { Dec: 7000 }, finishes: { Dec: "second" }, lossStreaks: { Dec: 0 },
    }, config);
    expect(out.nextChips.Dec).toBe(6750);
  });

  it("third loss adds 500 and resets streak", () => {
    const out = applyHandicap({
      ...base,
      currentChips: { Dave: 8000 }, finishes: { Dave: "loss" }, lossStreaks: { Dave: 2 },
    }, config);
    expect(out.nextChips.Dave).toBe(8500);
    expect(out.nextStreaks.Dave).toBe(0);
  });

  it("no-show counts as a loss toward the streak", () => {
    const out = applyHandicap({
      ...base,
      currentChips: { Fran: 8000 }, finishes: { Fran: "absent" }, lossStreaks: { Fran: 1 },
    }, config);
    expect(out.nextStreaks.Fran).toBe(2);
    expect(out.nextChips.Fran).toBe(8000);
  });

  it("clamps at the ceiling", () => {
    const out = applyHandicap({
      ...base,
      currentChips: { Dave: 9000 }, finishes: { Dave: "loss" }, lossStreaks: { Dave: 2 },
    }, config);
    expect(out.nextChips.Dave).toBe(9000); // 9500 clamped to 9000
  });

  it("split winners share the decrement", () => {
    const out = applyHandicap({
      firstCount: 2, secondCount: 1,
      currentChips: { Kev: 7000, Caoimh: 7000 },
      finishes: { Kev: "win", Caoimh: "win" },
      lossStreaks: {},
    }, config);
    expect(out.nextChips.Kev).toBe(6750); // −250 each (500 split two ways)
  });
});
