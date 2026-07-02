import { useCallback, useEffect, useMemo, useState } from "react";
import type { Config, GameInputs, PokerData } from "./types";
import { LocalStore } from "./store/local";
import { money, signedMoney, chips as fmtChips, date } from "./format";
import { outstanding, pokerPnl, gameYears, history } from "./engine/selectors";
import { proposeNextChips, buildGameEvent, type Env } from "./engine/replay";

type Tab = "dashboard" | "history" | "pnl" | "chips" | "newgame" | "pay" | "bet" | "rules";

/** Stable per-player colors for charts. */
const PALETTE = ["#d9a441", "#6ea8fe", "#3fb56b", "#b087e0", "#ff8c1a", "#e0604d"];
export const playerColor = (players: string[], p: string) =>
  PALETTE[players.indexOf(p) % PALETTE.length];

export function App() {
  const [env, setEnv] = useState<Env>(
    () => (localStorage.getItem("sp.env") as Env) || "prod"
  );
  const [data, setData] = useState<PokerData | null>(null);
  const [tab, setTab] = useState<Tab>("dashboard");

  const reload = useCallback(() => {
    LocalStore.getData(env).then(setData);
  }, [env]);

  useEffect(() => {
    localStorage.setItem("sp.env", env);
    reload();
  }, [env, reload]);

  if (!data) return <div className="loading">Loading Strange Poker…</div>;

  const TABS: [Tab, string][] = [
    ["dashboard", "♠ Home"], ["history", "♣ History"], ["pnl", "♦ P&L"],
    ["chips", "♥ Chips"], ["newgame", "+ Game"], ["pay", "€ Pay"],
    ["bet", "± Bet"], ["rules", "Rules"],
  ];

  return (
    <div className={`app env-${env}`}>
      {env === "test" && (
        <div className="test-banner">
          TEST MODE — nothing here touches the real history.{" "}
          <button
            onClick={async () => {
              if (confirm("Reset test data back to a clean copy of prod?")) {
                await LocalStore.resetTest();
                reload();
              }
            }}
          >
            Reset test data
          </button>
        </div>
      )}
      <div className="topbar">
        <header>
          <h1>Strange Poker</h1>
          <label className="env-toggle">
            <select value={env} onChange={(e) => setEnv(e.target.value as Env)}>
              <option value="prod">Prod</option>
              <option value="test">Test</option>
            </select>
          </label>
        </header>
        <nav>
          {TABS.map(([t, label]) => (
            <button key={t} className={t === tab ? "active" : ""} onClick={() => setTab(t)}>
              {label}
            </button>
          ))}
        </nav>
      </div>
      <main>
        {tab === "dashboard" && <Dashboard data={data} />}
        {tab === "history" && <History data={data} env={env} onChange={reload} />}
        {tab === "pnl" && <Pnl data={data} />}
        {tab === "chips" && <Chips data={data} />}
        {tab === "newgame" && (
          <NewGame data={data} env={env} onSaved={() => { reload(); setTab("chips"); }} />
        )}
        {tab === "pay" && (
          <Pay data={data} env={env} onSaved={() => { reload(); setTab("dashboard"); }} />
        )}
        {tab === "bet" && (
          <Bet data={data} env={env} onSaved={() => { reload(); setTab("history"); }} />
        )}
        {tab === "rules" && <Rules data={data} env={env} onChange={reload} />}
      </main>
      <footer>
        {data.events.filter((e) => !e.deletedAt).length} events · SP · {env}
        <span className="suits">♠♥♦♣</span>
      </footer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dashboard — transposed for mobile: one row per player
// ---------------------------------------------------------------------------

function Dashboard({ data }: { data: PokerData }) {
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
            <span className={`bar-val ${out[p] > 0 ? "pos" : out[p] < 0 ? "neg" : ""}`}>
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

function Cell({ v }: { v: number }) {
  return (
    <td className={v > 0 ? "pos" : v < 0 ? "neg" : ""}>{signedMoney(v)}</td>
  );
}

// ---------------------------------------------------------------------------
// History — undo kept on-screen (column right after date), scrollable table
// ---------------------------------------------------------------------------

const TYPE_LABEL: Record<string, string> = {
  main: "€20 game", after: "€5 game", in_person: "In person",
  bet: "Side bet", bonus: "Bonus", settle: "Settle", misc: "Misc",
};

function History({ data, env, onChange }: {
  data: PokerData; env: Env; onChange: () => void;
}) {
  const rows = useMemo(() => history(data), [data]);
  const [type, setType] = useState<string>("all");
  const years = gameYears(data);
  const [yr, setYr] = useState<string>("all");
  const [showDeleted, setShowDeleted] = useState(false);

  const filtered = rows.filter((r) => {
    if (!showDeleted && r.deletedAt) return false;
    if (type !== "all" && r.type !== type) return false;
    if (yr !== "all" && !(r.date ?? "").startsWith(yr)) return false;
    return true;
  });

  function downloadCsv() {
    const esc = (s: string) =>
      /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    const head = ["date", "type", ...data.players, "note", "undone"];
    const lines = [head.join(",")].concat(
      filtered.map((r) => [
        r.date ?? "", r.type,
        ...data.players.map((p) => r.deltas[p] ?? 0),
        esc(r.note ?? ""), r.deletedAt ? "yes" : "",
      ].join(","))
    );
    const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `strange-poker-history-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <section>
      <h2>History</h2>
      <div className="filters">
        <select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="all">All types</option>
          {Object.entries(TYPE_LABEL).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <select value={yr} onChange={(e) => setYr(e.target.value)}>
          <option value="all">All years</option>
          {years.map((y) => <option key={y} value={String(y)}>{y}</option>)}
        </select>
        <label className="chk">
          <input type="checkbox" checked={showDeleted}
            onChange={(e) => setShowDeleted(e.target.checked)} /> undone
        </label>
        <span className="count">{filtered.length}</span>
        <button className="mini" onClick={downloadCsv}>⬇ CSV</button>
      </div>
      <div className="tablewrap">
        <table className="grid history">
          <thead>
            <tr>
              {data.players.map((p) => <th key={p}>{p}</th>)}
              <th>Date</th>
              <th>Type</th>
              <th>Note</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id} className={r.deletedAt ? "deleted" : ""}>
                {data.players.map((p) => {
                  const v = r.deltas[p];
                  return (
                    <td key={p} className={v > 0 ? "pos" : v < 0 ? "neg" : "muted"}>
                      {v ? signedMoney(v) : "·"}
                    </td>
                  );
                })}
                <td className="nowrap">{date(r.date)}</td>
                <td><span className={`tag t-${r.type}`}>{TYPE_LABEL[r.type] ?? r.type}</span></td>
                <td className="note">{r.note}</td>
                <td className="actions">
                  {r.deletedAt ? (
                    <button className="mini" onClick={async () => {
                      await LocalStore.restoreEvent(String(r.id), env); onChange();
                    }}>↩ redo</button>
                  ) : (
                    <button className="mini" onClick={async () => {
                      if (confirm("Undo this entry? All chip calcs and totals recompute without it.")) {
                        await LocalStore.deleteEvent(String(r.id), env); onChange();
                      }
                    }}>undo</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// P&L — cumulative line chart + compact per-year table
// ---------------------------------------------------------------------------

function Pnl({ data }: { data: PokerData }) {
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
            {p} <b className={allTime[p] > 0 ? "pos" : allTime[p] < 0 ? "neg" : ""}>
              {signedMoney(allTime[p])}
            </b>
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

// ---------------------------------------------------------------------------
// Chips — sorted lowest stack first
// ---------------------------------------------------------------------------

/** Side-view stack of poker chips: one chip per 500, columns of 5. */
function ChipStack({ count, color }: { count: number; color: string }) {
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

function Chips({ data }: { data: PokerData }) {
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

// ---------------------------------------------------------------------------
// New game — preview shows chips before → after
// ---------------------------------------------------------------------------

function NewGame({ data, env, onSaved }: {
  data: PokerData; env: Env; onSaved: () => void;
}) {
  const players = data.players;
  const [kind, setKind] = useState<"main" | "after">("main");
  const [playing, setPlaying] = useState<Record<string, boolean>>(
    Object.fromEntries(players.map((p) => [p, true]))
  );
  const [rebuys, setRebuys] = useState<Record<string, number>>(
    Object.fromEntries(players.map((p) => [p, 0]))
  );
  const [first, setFirst] = useState<string[]>([]);
  const [second, setSecond] = useState<string[]>([]);
  const [gameDate, setGameDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");

  const entrants = players.filter((p) => playing[p]);
  const noShows = kind === "main" ? players.filter((p) => !playing[p]) : [];

  const inputs: GameInputs | null = first.length > 0 ? {
    kind,
    entrants: entrants.map((p) => ({ player: p, rebuys: rebuys[p] ?? 0 })),
    first,
    second: kind === "main" && entrants.length === 6 && second.length ? second : undefined,
    noShows: noShows.length ? noShows : undefined,
  } : null;

  const before = useMemo(() => proposeNextChips(data), [data]);
  const preview = useMemo(() => {
    if (!inputs) return null;
    try {
      const e = buildGameEvent(inputs, {
        id: "preview", date: gameDate, config: data.config, players, env,
      });
      const next = proposeNextChips({ ...data, events: [...data.events, e] });
      return { deltas: e.deltas, next };
    } catch {
      return null;
    }
  }, [inputs && JSON.stringify(inputs), gameDate, data]); // eslint-disable-line

  async function save() {
    if (!inputs) { setErr("Pick at least a winner."); return; }
    if (first.some((p) => !playing[p]) || second.some((p) => !playing[p])) {
      setErr("Winner/2nd must be playing."); return;
    }
    const e = buildGameEvent(inputs, {
      id: crypto.randomUUID(), date: gameDate, config: data.config, players, env, note,
    });
    await LocalStore.addEvent(e, env);
    onSaved();
  }

  const toggle = (list: string[], set: (v: string[]) => void, p: string) =>
    set(list.includes(p) ? list.filter((x) => x !== p) : [...list, p]);

  return (
    <section>
      <h2>Record a game {env === "test" && <span className="tag t-settle">test</span>}</h2>

      <div className="form-row">
        <label>Type{" "}
          <select value={kind} onChange={(e) => setKind(e.target.value as "main" | "after")}>
            <option value="main">€20 main</option>
            <option value="after">€5 after-game</option>
          </select>
        </label>
        <label>Date{" "}
          <input type="date" value={gameDate} onChange={(e) => setGameDate(e.target.value)} />
        </label>
      </div>

      <table className="grid">
        <thead>
          <tr><th>Player</th><th>In</th>{kind === "main" && <th>Rebuys</th>}<th>1st</th>
            {kind === "main" && entrants.length === 6 && <th>2nd</th>}</tr>
        </thead>
        <tbody>
          {players.map((p) => (
            <tr key={p}>
              <th>{p}</th>
              <td><input type="checkbox" checked={playing[p]}
                onChange={(e) => setPlaying({ ...playing, [p]: e.target.checked })} /></td>
              {kind === "main" && (
                <td><input type="number" min={0} max={9} className="num" value={rebuys[p]}
                  disabled={!playing[p]}
                  onChange={(e) => setRebuys({ ...rebuys, [p]: Number(e.target.value) })} /></td>
              )}
              <td><input type="checkbox" checked={first.includes(p)} disabled={!playing[p]}
                onChange={() => toggle(first, setFirst, p)} /></td>
              {kind === "main" && entrants.length === 6 && (
                <td><input type="checkbox" checked={second.includes(p)}
                  disabled={!playing[p] || first.includes(p)}
                  onChange={() => toggle(second, setSecond, p)} /></td>
              )}
            </tr>
          ))}
        </tbody>
      </table>

      <div className="form-row">
        <input className="wide" placeholder="Note (optional)" value={note}
          onChange={(e) => setNote(e.target.value)} />
      </div>

      {preview && (
        <>
          <h3>Preview</h3>
          <table className="grid">
            <thead>
              <tr><th>Player</th><th>Money</th>{kind === "main" && <th>Chips next game</th>}</tr>
            </thead>
            <tbody>
              {players.map((p) => {
                const d = preview.deltas[p] ?? 0;
                const b = before.chips[p], a = preview.next.chips[p];
                const changed = kind === "main" && b != null && a != null && a !== b;
                return (
                  <tr key={p}>
                    <th>{p}</th>
                    <td className={d > 0 ? "pos" : d < 0 ? "neg" : "muted"}>
                      {d ? signedMoney(d) : "·"}
                    </td>
                    {kind === "main" && (
                      <td>
                        {a == null ? "—" : changed ? (
                          <span className="chip-change">
                            <s className="muted">{fmtChips(b!)}</s>{" → "}
                            <b className={a < b! ? "neg" : "pos"}>{fmtChips(a)}</b>
                            <span className={`delta ${a < b! ? "neg" : "pos"}`}>
                              {" "}({a < b! ? "−" : "+"}{fmtChips(Math.abs(a - b!))})
                            </span>
                          </span>
                        ) : (
                          <span className="muted">{fmtChips(a)}</span>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}

      {err && <p className="error">{err}</p>}
      <div className="form-row">
        <button className="primary" onClick={save} disabled={!inputs}>
          Save game{env === "test" ? " (test)" : ""}
        </button>
      </div>
      <p className="hint">
        Split 1st = tick multiple winners. Pot and payouts
        ({entrants.length === 6 && kind === "main" ? "65/35" : "winner takes all"})
        are computed automatically. Everything saved here can be undone from History.
      </p>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Pay — record real money changing hands (settlement)
// ---------------------------------------------------------------------------

function Pay({ data, env, onSaved }: {
  data: PokerData; env: Env; onSaved: () => void;
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
    await LocalStore.addEvent({
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

// ---------------------------------------------------------------------------
// Bet — side bets, bonuses, and misc owings (the sheet's top block)
// ---------------------------------------------------------------------------

const BET_TYPES = [
  ["bet", "Side bet"],
  ["bonus", "Bonus (flush etc.)"],
  ["misc", "Misc owing (sweepstake, trip, …)"],
] as const;

function Bet({ data, env, onSaved }: {
  data: PokerData; env: Env; onSaved: () => void;
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
    await LocalStore.addEvent({
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
              {p} <b className={deltas![p] > 0 ? "pos" : "neg"}>{signedMoney(deltas![p])}</b>
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

// ---------------------------------------------------------------------------
// Rules — mechanical game settings (editable) + house rules (editable text)
// ---------------------------------------------------------------------------

const CONFIG_FIELDS: [keyof Config, string][] = [
  ["mainEntry", "Main game entry (€)"],
  ["afterEntry", "After-game entry (€)"],
  ["secondPlaceShare", "2nd place share of pot (6 players)"],
  ["winDecrement", "Chips off next game for winning"],
  ["secondDecrement", "Chips off next game for 2nd"],
  ["lossIncrement", "Chips added after losing streak"],
  ["lossStreakForIncrement", "Losses in a row to trigger it"],
  ["chipMin", "Minimum stack"],
  ["chipMax", "Maximum stack"],
];

function Rules({ data, env, onChange }: {
  data: PokerData; env: Env; onChange: () => void;
}) {
  const [cfg, setCfg] = useState<Config>(data.config);
  const [rules, setRules] = useState<string[]>([]);
  const [newRule, setNewRule] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => { LocalStore.getRules(env).then(setRules); }, [env]);
  useEffect(() => { setCfg(data.config); }, [data.config]);

  async function saveConfig() {
    await LocalStore.saveConfig(cfg, env);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
    onChange();
  }

  async function saveRules(next: string[]) {
    setRules(next);
    await LocalStore.saveRules(next, env);
  }

  return (
    <section>
      <h2>Game settings {env === "test" && <span className="tag t-settle">test</span>}</h2>
      <div className="form-col">
        {CONFIG_FIELDS.map(([key, label]) => (
          <label key={key} className="cfg-row">
            <span>{label}</span>
            <input type="number" step="any" className="num-wide"
              value={cfg[key]}
              onChange={(e) => setCfg({ ...cfg, [key]: Number(e.target.value) })} />
          </label>
        ))}
      </div>
      <div className="form-row">
        <button className="primary" onClick={saveConfig}>Save settings</button>
        {saved && <span className="pos">✓ saved</span>}
      </div>
      <p className="hint">
        These drive the payout and handicap engine{env === "test"
          ? " — in test mode, so experiment freely."
          : ". Changing them affects future games only (history is stored, not recomputed)."}
      </p>

      <h2>House rules</h2>
      <ul className="rules-list">
        {rules.map((r, i) => (
          <li key={i}>
            <span>{r}</span>
            <button className="mini" onClick={() => saveRules(rules.filter((_, j) => j !== i))}>
              remove
            </button>
          </li>
        ))}
      </ul>
      <div className="form-row">
        <input className="wide" placeholder="Add a house rule…" value={newRule}
          onChange={(e) => setNewRule(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && newRule.trim()) {
              saveRules([...rules, newRule.trim()]); setNewRule("");
            }
          }} />
        <button className="mini" onClick={() => {
          if (newRule.trim()) { saveRules([...rules, newRule.trim()]); setNewRule(""); }
        }}>add</button>
      </div>
      <p className="hint">
        Informational reminders (bonuses, table etiquette). The mechanical ones
        above are what the app actually computes with.
      </p>
    </section>
  );
}
