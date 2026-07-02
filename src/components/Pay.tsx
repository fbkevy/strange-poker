// Pay — record real money changing hands (settlement).

import { useMemo, useState } from "react";
import type { PokerData } from "../types";
import type { Env } from "../engine/replay";
import type { Store } from "../store";
import { money, signedMoney } from "../format";
import { outstanding } from "../engine/selectors";

export function Pay({ data, env, store, onSaved }: {
  data: PokerData; env: Env; store: Store; onSaved: () => void;
}) {
  const players = data.players;
  const out = useMemo(() => outstanding(data), [data]);
  const [payer, setPayer] = useState(players[0]);
  const [payee, setPayee] = useState(players[1]);
  const [amount, setAmount] = useState("");
  const [payDate, setPayDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [err, setErr] = useState("");

  const amt = Number(amount);
  const valid = payer !== payee && amt > 0 && Number.isFinite(amt);

  async function save() {
    if (!valid) { setErr("Pick two different players and a positive amount."); return; }
    await store.addEvent({
      id: crypto.randomUUID(),
      env,
      date: payDate,
      type: "settle",
      block: "ledger",
      note: `${payer} paid ${payee}`,
      // Cash settles debt: the payer's balance rises, the payee's falls.
      deltas: Object.fromEntries(players.map((p) =>
        [p, p === payer ? amt : p === payee ? -amt : 0])),
      chips: null,
      buyins: null,
    }, env);
    onSaved();
  }

  return (
    <section>
      <h2>Record a payment {env === "test" && <span className="tag t-settle">test</span>}</h2>
      <div className="form-col">
        <label>Who paid{" "}
          <select value={payer} onChange={(e) => setPayer(e.target.value)}>
            {players.map((p) => (
              <option key={p} value={p}>{p} ({signedMoney(out[p])})</option>
            ))}
          </select>
        </label>
        <label>Who received{" "}
          <select value={payee} onChange={(e) => setPayee(e.target.value)}>
            {players.map((p) => (
              <option key={p} value={p}>{p} ({signedMoney(out[p])})</option>
            ))}
          </select>
        </label>
        <label>Amount €{" "}
          <input type="number" min="0" step="5" className="num-wide" value={amount}
            inputMode="decimal" onChange={(e) => setAmount(e.target.value)} />
        </label>
        <label>Date{" "}
          <input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
        </label>
      </div>
      {valid && (
        <p className="hint">
          {payer} pays {payee} {money(amt)} → {payer}'s balance{" "}
          {signedMoney(out[payer])} → <b>{signedMoney(out[payer] + amt)}</b>,{" "}
          {payee}: {signedMoney(out[payee])} → <b>{signedMoney(out[payee] - amt)}</b>.
        </p>
      )}
      {err && <p className="error">{err}</p>}
      <div className="form-row">
        <button className="primary" onClick={save} disabled={!valid}>
          Save payment{env === "test" ? " (test)" : ""}
        </button>
      </div>
      <p className="hint">
        Payments don't touch P&L — they only settle who owes whom. Undoable from History.
      </p>
    </section>
  );
}
