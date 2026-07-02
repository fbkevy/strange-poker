// Chips — proposal for the next game, sorted lowest stack first.

import { useMemo } from "react";
import type { PokerData } from "../types";
import { chips as fmtChips } from "../format";
import { proposeNextChips } from "../engine/replay";
import { ChipStack, playerColor } from "./shared";

export function Chips({ data }: { data: PokerData }) {
  const proposal = useMemo(() => proposeNextChips(data), [data]);
  const players = [...data.players].sort(
    (a, b) => (proposal.chips[a] ?? Infinity) - (proposal.chips[b] ?? Infinity)
  );

  return (
    <section>
      <h2>Chips for the next game</h2>
      <div className="chip-rows">
        {players.map((p) => (
          <div key={p} className="chip-row">
            <span className="bar-label">{p}</span>
            <ChipStack
              count={Math.round((proposal.chips[p] ?? 0) / 500)}
              color={playerColor(data.players, p)} />
            <span className="bar-val">
              {proposal.chips[p] == null ? "—" : fmtChips(proposal.chips[p])}
            </span>
          </div>
        ))}
      </div>
      <table className="grid">
        <thead>
          <tr><th>Player</th><th>Stack</th><th>Streak</th><th>Why</th></tr>
        </thead>
        <tbody>
          {players.map((p) => (
            <tr key={p}>
              <th>{p}</th>
              <td>{proposal.chips[p] == null ? "—" : fmtChips(proposal.chips[p])}</td>
              <td>{proposal.streaks[p] ?? 0}</td>
              <td className="note">{proposal.reasons[p] ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="hint">
        Lowest stack first. Derived by replaying every recorded game — undo any
        past result and this recomputes.
      </p>
    </section>
  );
}
