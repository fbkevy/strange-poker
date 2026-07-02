// Bet — side bets, bonuses, and misc owings (the sheet's top block).

import { useEffect, useState } from "react";
import type { PokerData } from "../types";
import type { Env } from "../engine/replay";
import type { Store } from "../store";
import { money, signedMoney } from "../format";
import { TYPE_LABEL, signClass } from "./shared";

const BET_TYPES = [
  ["bet", "Side bet"],
  ["bonus", "Bonus (flush etc.)"],
  ["misc", "Misc owing (sweepstake, trip, …)"],
] as const;

export function Bet({ data, env, store, onSaved }: {
  data: PokerData; env: Env; store: Store; onSaved: () => void;
}) {
  const players = data.players;
  const [betType, setBetType] = useState<"bet" | "bonus" | "misc">("bet");
  const [mode, setMode] = useState<"winner" | "custom">("winner");
  const [betDate, setBetDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");

  // winner mode
  const [winner, setWinner] = useState(players[0]);
  const [inBet, setInBet] = useState<Record<string, boolean>>(
    Object.fromEntries(players.map((p) => [p, true]))
  );
  const [amountEach, setAmountEach] = useState("");

  // custom mode
  const [custom, setCustom] = useState<Record<string, string>>(
    Object.fromEntries(players.map((p) => [p, ""]))
  );

  // bonuses count toward poker P&L (like the sheet's flush rows); bets/misc don't
  const [inPnl, setInPnl] = useState(false);
  useEffect(() => setInPnl(betType === "bonus"), [betType]);

  let deltas: Record<string, number> | null = null;
  if (mode === "winner") {
    const amt = Number(amountEach);
    const payers = players.filter((p) => inBet[p] && p !== winner);
    if (amt > 0 && inBet[winner] && payers.length > 0) {
      deltas = Object.fromEntries(players.map((p) => [
        p, p === winner ? amt * payers.length : inBet[p] ? -amt : 0,
      ]));
    }
  } else {
    const vals = players.map((p) => Number(custom[p] || 0));
    const sum = vals.reduce((a, b) => a + b, 0);
    const any = vals.some((v) => v !== 0);
    if (any && Math.abs(sum) < 0.005 && vals.every((v) => Number.isFinite(v))) {
      deltas = Object.fromEntries(players.map((p, i) => [p, vals[i]]));
    }
  }
  const customSum = players.reduce((a, p) => a + Number(custom[p] || 0), 0);

  async function save() {
    if (!deltas) return;
    await store.addEvent({
      id: crypto.randomUUID(),
      env,
      date: betDate,
      type: betType,
      block: inPnl ? "game" : "ledger",
      note: note || (mode === "winner" ? `${winner} wins ${TYPE_LABEL[betType]?.toLowerCase() ?? betType}` : ""),
      deltas,
      chips: null,
      buyins: null,
    }, env);
    onSaved();
  }

  return (
    <section>
      <h2>Record a bet / owing {env === "test" && <span className="tag t-settle">test</span>}</h2>

      <div className="form-row">
        <label>Type{" "}
          <select value={betType} onChange={(e) => setBetType(e.target.value as typeof betType)}>
            {BET_TYPES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label>Date{" "}
          <input type="date" value={betDate} onChange={(e) => setBetDate(e.target.value)} />
        </label>
      </div>

      <div className="form-row">
        <label className="chk">
          <input type="radio" name="betmode" checked={mode === "winner"}
            onChange={() => setMode("winner")} /> one winner, everyone pays
        </label>
        <label className="chk">
          <input type="radio" name="betmode" checked={mode === "custom"}
            onChange={() => setMode("custom")} /> custom amounts
        </label>
      </div>

      {mode === "winner" ? (
        <>
          <div className="form-col">
            <label>Winner{" "}
              <select value={winner} onChange={(e) => setWinner(e.target.value)}>
                {players.filter((p) => inBet[p]).map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </label>
            <label>Each pays €{" "}
              <input type="number" min="0" step="5" className="num-wide" inputMode="decimal"
                value={amountEach} onChange={(e) => setAmountEach(e.target.value)} />
            </label>
          </div>
          <table className="grid">
            <thead><tr><th>Player</th><th>In</th></tr></thead>
            <tbody>
              {players.map((p) => (
                <tr key={p}>
                  <th>{p}</th>
                  <td><input type="checkbox" checked={inBet[p]}
                    onChange={(e) => setInBet({ ...inBet, [p]: e.target.checked })} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : (
        <>
          <table className="grid">
            <thead><tr><th>Player</th><th>Amount € (+ receives / − pays)</th></tr></thead>
            <tbody>
              {players.map((p) => (
                <tr key={p}>
                  <th>{p}</th>
                  <td><input type="number" step="any" className="num-wide" inputMode="decimal"
                    placeholder="0" value={custom[p]}
                    onChange={(e) => setCustom({ ...custom, [p]: e.target.value })} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className={Math.abs(customSum) < 0.005 ? "hint" : "error"}>
            Sum: {money(customSum)} {Math.abs(customSum) >= 0.005 && "— must be €0 (zero-sum)"}
          </p>
        </>
      )}

      <div className="form-row">
        <input className="wide" placeholder="Note (e.g. Putin bet, Euro 28 sweepstake)"
          value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <div className="form-row">
        <label className="chk">
          <input type="checkbox" checked={inPnl} onChange={(e) => setInPnl(e.target.checked)} />
          counts toward poker P&L
        </label>
      </div>

      {deltas && (
        <p className="hint">
          {players.filter((p) => deltas![p]).map((p) => (
            <span key={p} style={{ marginRight: "0.8em" }}>
              {p} <b className={signClass(deltas![p])}>{signedMoney(deltas![p])}</b>
            </span>
          ))}
        </p>
      )}

      <div className="form-row">
        <button className="primary" onClick={save} disabled={!deltas}>
          Save{env === "test" ? " (test)" : ""}
        </button>
      </div>
      <p className="hint">
        Side bets and misc owings count toward balances only (like the sheet's top
        block); bonuses default to counting in P&L too. Undoable from History.
      </p>
    </section>
  );
}
