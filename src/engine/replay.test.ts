import { describe, it, expect } from "vitest";
import type { Config, LedgerEvent, PokerData } from "../types";
import {
  liveEvents,
  proposeNextChips,
  buildGameEvent,
  undoEvent,
  restoreEvent,
} from "./replay";

const config: Config = {
  chipMin: 6000, chipMax: 9000,
  winDecrement: 500, secondDecrement: 250,
  lossIncrement: 500, lossStreakForIncrement: 3,
  mainEntry: 20, afterEntry: 5,
  secondPlaceShare: 0.35,
  straightFlushBonus: 5, royalFlushBonus: 10,
};

const PLAYERS = ["Dec", "Pauli", "Kev"];

/** Legacy sheet row: chips are a recorded snapshot, no inputs. */
function legacyMain(id: string, date: string, chips: Record<string, number>,
  deltas: Record<string, number>): LedgerEvent {
  return { id, date, type: "main", block: "game", note: "", deltas, chips, buyins: {} };
}

/** App-created main game from wizard inputs. */
function appMain(id: string, date: string, first: string[],
  players: string[] = PLAYERS, noShows: string[] = []): LedgerEvent {
  return buildGameEvent(
    {
      kind: "main",
      entrants: players.map((p) => ({ player: p, rebuys: 0 })),
      first,
      noShows,
    },
    { id, date, config, players: PLAYERS }
  );
}

function data(events: LedgerEvent[]): PokerData {
  return { players: PLAYERS, config, events };
}

describe("liveEvents", () => {
  it("excludes soft-deleted events", () => {
    const e1 = legacyMain("a", "2026-01-01", { Dec: 7000 }, { Dec: 0 });
    const e2 = { ...legacyMain("b", "2026-01-02", { Dec: 6500 }, { Dec: 0 }), deletedAt: "2026-01-03T00:00:00Z" };
    expect(liveEvents([e1, e2]).map((e) => e.id)).toEqual(["a"]);
  });

  it("filters by env, treating missing env as prod", () => {
    const prod = legacyMain("a", "2026-01-01", { Dec: 7000 }, { Dec: 0 });
    const test = { ...legacyMain("b", "2026-01-02", { Dec: 6500 }, { Dec: 0 }), env: "test" as const };
    expect(liveEvents([prod, test], "prod").map((e) => e.id)).toEqual(["a"]);
    expect(liveEvents([prod, test], "test").map((e) => e.id)).toEqual(["b"]);
  });
});

describe("proposeNextChips", () => {
  it("starts from the latest legacy snapshot and applies later app games", () => {
    // Legacy snapshot: Dec 7000, Pauli 8000, Kev 6500.
    const legacy = legacyMain("L", "2026-01-01",
      { Dec: 7000, Pauli: 8000, Kev: 6500 },
      { Dec: 40, Pauli: -20, Kev: -20 }); // Dec won that game
    // App game after it: Kev wins.
    const g1 = appMain("G1", "2026-02-01", ["Kev"]);
    const { chips } = proposeNextChips(data([legacy, g1]), "prod");
    // Dec won the LEGACY game -> -500 => 6500; Kev won G1 -> -500 => 6000
    expect(chips.Kev).toBe(6000);
    expect(chips.Dec).toBe(6500);
  });

  it("undoing a game reverses its chip impact on the proposal", () => {
    const legacy = legacyMain("L", "2026-01-01",
      { Dec: 7000, Pauli: 8000, Kev: 6500 },
      { Dec: -20, Pauli: -20, Kev: 40 });
    const g1 = appMain("G1", "2026-02-01", ["Kev"]);
    const d = data([legacy, g1]);

    const before = proposeNextChips(d, "prod").chips.Kev; // 6500 -500(L) -500(G1) = 5500 -> clamped 6000
    const undone = data([legacy, undoEvent(g1)]);
    const after = proposeNextChips(undone, "prod").chips.Kev; // only legacy win applies

    expect(before).toBe(6000); // clamped at floor
    expect(after).toBe(6000); // 6500 - 500
  });

  it("three losses (incl. no-shows) bumps the stack and resets", () => {
    const legacy = legacyMain("L", "2026-01-01",
      { Dec: 7000, Pauli: 8000, Kev: 6500 },
      { Dec: 40, Pauli: -20, Kev: -20 }); // Pauli loss #1
    const g1 = appMain("G1", "2026-02-01", ["Dec"], ["Dec", "Kev"], ["Pauli"]); // no-show = loss #2
    const g2 = appMain("G2", "2026-03-01", ["Kev"]); // Pauli plays and loses = #3
    const { chips, streaks } = proposeNextChips(data([legacy, g1, g2]), "prod");
    expect(chips.Pauli).toBe(8500); // 8000 + 500
    expect(streaks.Pauli).toBe(0);
  });

  it("clamps proposals to [chipMin, chipMax]", () => {
    const legacy = legacyMain("L", "2026-01-01",
      { Dec: 6000, Pauli: 9000, Kev: 7000 },
      { Dec: 40, Pauli: -20, Kev: -20 });
    const { chips } = proposeNextChips(data([legacy]), "prod");
    expect(chips.Dec).toBe(6000); // 6000-500 clamped up to min
  });

  it("respects manual chip overrides in inputs", () => {
    const legacy = legacyMain("L", "2026-01-01",
      { Dec: 7000, Pauli: 8000, Kev: 6500 },
      { Dec: 40, Pauli: -20, Kev: -20 });
    const g1 = buildGameEvent(
      {
        kind: "main",
        entrants: PLAYERS.map((p) => ({ player: p, rebuys: 0 })),
        first: ["Kev"],
        chipOverrides: { Dec: 8888 },
      },
      { id: "G1", date: "2026-02-01", config, players: PLAYERS }
    );
    const { chips } = proposeNextChips(data([legacy, g1]), "prod");
    expect(chips.Dec).toBe(8888); // override wins over computed 6500
  });
});

describe("buildGameEvent", () => {
  it("creates a zero-sum main event with correct payout", () => {
    const e = appMain("G1", "2026-02-01", ["Kev"]);
    expect(e.type).toBe("main");
    expect(e.block).toBe("game");
    expect(Object.values(e.deltas).reduce((a, b) => a + b, 0)).toBe(0);
    expect(e.deltas.Kev).toBe(40); // 60 pot - 20 outlay
  });

  it("after-games are type 'after' and never carry chips", () => {
    const e = buildGameEvent(
      { kind: "after", entrants: PLAYERS.map((p) => ({ player: p, rebuys: 0 })), first: ["Dec"] },
      { id: "A1", date: "2026-02-01", config, players: PLAYERS }
    );
    expect(e.type).toBe("after");
    expect(e.chips).toBeNull();
  });
});

describe("undo / restore", () => {
  it("undoEvent sets deletedAt; restoreEvent clears it", () => {
    const e = appMain("G1", "2026-02-01", ["Kev"]);
    const undone = undoEvent(e);
    expect(undone.deletedAt).toBeTruthy();
    expect(restoreEvent(undone).deletedAt).toBeNull();
  });

  it("undo removes the event from money totals", () => {
    const g1 = appMain("G1", "2026-02-01", ["Kev"]);
    const live = liveEvents([undoEvent(g1)]);
    expect(live).toHaveLength(0);
  });
});
