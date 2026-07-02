// P&L — cumulative line chart + compact per-year table.

import type { PokerData } from "../types";
import { signedMoney } from "../format";
import { gameYears, pokerPnl } from "../engine/selectors";
import { Cell, playerColor, signClass } from "./shared";

export function Pnl({ data }: { data: PokerData }) {
  const years = [...gameYears(data)].sort((a, b) => a - b);
  const players = data.players;
  const perYear = years.map((y) => pokerPnl(data, y));
  const allTime = pokerPnl(data);

  // Cumulative series per player across years.
  const series = players.map((p) => {
    let acc = 0;
    return { p, points: perYear.map((vals) => (acc += vals[p])) };
  });
  const flat = series.flatMap((s) => s.points);
  const lo = Math.min(0, ...flat), hi = Math.max(0, ...flat);
  const W = 360, H = 200, PAD = 8;
  const x = (i: number) => PAD + (i * (W - 2 * PAD)) / Math.max(1, years.length - 1);
  const y = (v: number) => H - PAD - ((v - lo) * (H - 2 * PAD)) / Math.max(1, hi - lo);

  return (
    <section>
      <h2>Profit &amp; Loss</h2>

      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img"
        aria-label="Cumulative P&L per player over the years">
        <line x1={PAD} x2={W - PAD} y1={y(0)} y2={y(0)} stroke="#2a323c" strokeDasharray="3 3" />
        {series.map((s) => (
          <polyline key={s.p} fill="none" stroke={playerColor(players, s.p)}
            strokeWidth="2"
            points={s.points.map((v, i) => `${x(i)},${y(v)}`).join(" ")} />
        ))}
        {series.map((s) => (
          <circle key={s.p} cx={x(s.points.length - 1)} cy={y(s.points[s.points.length - 1])}
            r="3" fill={playerColor(players, s.p)} />
        ))}
      </svg>
      <div className="legend">
        {players.map((p) => (
          <span key={p} className="legend-item">
            <span className="dot" style={{ background: playerColor(players, p) }} />
            {p} <b className={signClass(allTime[p])}>{signedMoney(allTime[p])}</b>
          </span>
        ))}
      </div>

      <div className="tablewrap">
        <table className="grid compact">
          <thead>
            <tr><th>Year</th>{players.map((p) => <th key={p}>{p}</th>)}</tr>
          </thead>
          <tbody>
            {[...years].reverse().map((yr, ri) => {
              const vals = perYear[years.length - 1 - ri];
              return (
                <tr key={yr}>
                  <th>{yr}</th>
                  {players.map((p) => <Cell key={p} v={vals[p]} />)}
                </tr>
              );
            })}
            <tr className="total">
              <th>All</th>
              {players.map((p) => <Cell key={p} v={allTime[p]} />)}
            </tr>
          </tbody>
        </table>
      </div>
      <p className="hint">Cumulative poker P&L by year (chart) — side bets and settlements excluded.</p>
    </section>
  );
}
