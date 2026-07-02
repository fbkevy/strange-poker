// Dashboard — transposed for mobile: one row per player.

import { useMemo } from "react";
import type { PokerData } from "../types";
import { signedMoney } from "../format";
import { outstanding, pokerPnl } from "../engine/selectors";
import { Cell, playerColor, signClass } from "./shared";

export function Dashboard({ data }: { data: PokerData }) {
  const out = useMemo(() => outstanding(data), [data]);
  const thisYear = new Date().getFullYear();
  const ytd = useMemo(() => pokerPnl(data, thisYear), [data, thisYear]);
  const allTime = useMemo(() => pokerPnl(data), [data]);
  // Sensible order: biggest creditor first.
  const players = [...data.players].sort((a, b) => out[b] - out[a]);
  const maxAbs = Math.max(1, ...players.map((p) => Math.abs(out[p])));

  return (
    <section>
      <h2>Standings</h2>
      <table className="grid">
        <thead>
          <tr><th>Player</th><th>Owed</th><th>{thisYear} P&L</th><th>All-time</th></tr>
        </thead>
        <tbody>
          {players.map((p) => (
            <tr key={p}>
              <th><span className="dot" style={{ background: playerColor(data.players, p) }} />{p}</th>
              <Cell v={out[p]} />
              <Cell v={ytd[p]} />
              <Cell v={allTime[p]} />
            </tr>
          ))}
        </tbody>
      </table>

      <h3>Who's owed what</h3>
      <div className="bars">
        {players.map((p) => (
          <div key={p} className="bar-row">
            <span className="bar-label">{p}</span>
            <div className="bar-track">
              <div className="bar-half">
                {out[p] < 0 && (
                  <div className="bar neg-bar"
                    style={{ width: `${(Math.abs(out[p]) / maxAbs) * 100}%` }} />
                )}
              </div>
              <div className="bar-half">
                {out[p] > 0 && (
                  <div className="bar pos-bar"
                    style={{ width: `${(out[p] / maxAbs) * 100}%` }} />
                )}
              </div>
            </div>
            <span className={`bar-val ${signClass(out[p])}`}>
              {signedMoney(out[p])}
            </span>
          </div>
        ))}
      </div>
      <p className="hint">
        <strong>Owed</strong> = net position across everything (games, side bets,
        settlements). <strong>P&L</strong> = poker games only.
      </p>
    </section>
  );
}
