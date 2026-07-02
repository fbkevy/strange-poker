// Small building blocks shared across screens.

import { signedMoney } from "../format";

/** Stable per-player colors for charts. */
const PALETTE = ["#d9a441", "#6ea8fe", "#3fb56b", "#b087e0", "#ff8c1a", "#e0604d"];
export const playerColor = (players: string[], p: string) =>
  PALETTE[players.indexOf(p) % PALETTE.length];

/** pos/neg CSS class for a signed amount. */
export const signClass = (v: number, zero = "") =>
  v > 0 ? "pos" : v < 0 ? "neg" : zero;

export const TYPE_LABEL: Record<string, string> = {
  main: "€20 game", after: "€5 game", in_person: "In person",
  bet: "Side bet", bonus: "Bonus", settle: "Settle", misc: "Misc",
};

/** Signed money table cell, colored by sign. */
export function Cell({ v }: { v: number }) {
  return <td className={signClass(v)}>{signedMoney(v)}</td>;
}

/** Side-view stack of poker chips: one chip per 500, columns of 5. */
export function ChipStack({ count, color }: { count: number; color: string }) {
  const CH = 7, CW = 30, COL = 5, GAP = 6;
  const cols = Math.max(1, Math.ceil(count / COL));
  const W = cols * (CW + GAP);
  const H = COL * (CH + 1) + 2;
  return (
    <svg className="chipstack" viewBox={`0 0 ${W} ${H}`}
      style={{ width: W, height: H }} aria-label={`${count} chips`}>
      {Array.from({ length: count }, (_, i) => {
        const col = Math.floor(i / COL);
        const row = i % COL;
        const x = col * (CW + GAP);
        const y = H - (row + 1) * (CH + 1);
        return (
          <g key={i}>
            <rect x={x} y={y} width={CW} height={CH} rx={CH / 2} fill={color} />
            {/* edge stripes */}
            {[0.2, 0.5, 0.8].map((f) => (
              <rect key={f} x={x + CW * f - 1.5} y={y + 1} width={3}
                height={CH - 2} rx={1} fill="rgba(255,255,255,.55)" />
            ))}
          </g>
        );
      })}
    </svg>
  );
}
