import { useCallback, useEffect, useMemo, useState } from "react";
import type { GameInputs, PokerData } from "./types";
import { LocalStore } from "./store/local";
import { money, signedMoney, chips as fmtChips, date } from "./format";
import { outstanding, pokerPnl, gameYears, history } from "./engine/selectors";
import { proposeNextChips, buildGameEvent, type Env } from "./engine/replay";

type Tab = "dashboard" | "history" | "pnl" | "chips" | "newgame";

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
      <header>
        <h1>Strange Poker</h1>
        <nav>
          {(["dashboard", "history", "pnl", "chips", "newgame"] as Tab[]).map((t) => (
            <button key={t} className={t === tab ? "active" : ""} onClick={() => setTab(t)}>
              {t === "pnl" ? "P&L" : t === "newgame" ? "+ Game" : t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
        </nav>
        <label className="env-toggle">
          <select value={env} onChange={(e) => setEnv(e.target.value as Env)}>
            <option value="prod">Prod</option>
            <option value="test">Test</option>
          </select>
        </label>
      </header>
      <main>
        {tab === "dashboard" && <Dashboard data={data} />}
        {tab === "history" && <History data={data} env={env} onChange={reload} />}
        {tab === "pnl" && <Pnl data={data} />}
        {tab === "chips" && <Chips data={data} />}
        {tab === "newgame" && (
          <NewGame data={data} env={env} onSaved={() => { reload(); setTab("chips"); }} />
        )}
      </main>
      <footer>
        {data.events.filter((e) => !e.deletedAt).length} events · SP · {env}
      </footer>
    </div>
  );
}

function StatRow({ label, values, players }: {
  label: string;
  values: Record<string, number>;
  players: string[];
}) {
  return (
    <tr>
      <th>{label}</th>
      {players.map((p) => (
        <td key={p} className={values[p] > 0 ? "pos" : values[p] < 0 ? "neg" : ""}>
          {signedMoney(values[p])}
        </td>
      ))}
    </tr>
  );
}

function Dashboard({ data }: { data: PokerData }) {
  const out = useMemo(() => outstanding(data), [data]);
  const thisYear = new Date().getFullYear();
  const ytd = useMemo(() => pokerPnl(data, thisYear), [data, thisYear]);
  const allTime = useMemo(() => pokerPnl(data), [data]);
  const players = data.players;

  return (
    <section>
      <h2>Standings</h2>
      <table className="grid">
        <thead>
          <tr><th></th>{players.map((p) => <th key={p}>{p}</th>)}</tr>
        </thead>
        <tbody>
          <StatRow label="Outstanding" values={out} players={players} />
          <StatRow label={`P&L ${thisYear} (YTD)`} values={ytd} players={players} />
          <StatRow label="P&L all-time" values={allTime} players={players} />
        </tbody>
      </table>
      <p className="hint">
        <strong>Outstanding</strong> = net owed across everything (games + side
        debts + settlements). <strong>P&L</strong> = poker games only.
      </p>
    </section>
  );
}

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
            onChange={(e) => setShowDeleted(e.target.checked)} /> show undone
        </label>
        <span className="count">{filtered.length} rows</span>
      </div>
      <table className="grid history">
        <thead>
          <tr>
            <th>Date</th>
            <th>Type</th>
            {data.players.map((p) => <th key={p}>{p}</th>)}
            <th>Note</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((r) => (
            <tr key={r.id} className={r.deletedAt ? "deleted" : ""}>
              <td className="nowrap">{date(r.date)}</td>
              <td><span className={`tag t-${r.type}`}>{TYPE_LABEL[r.type] ?? r.type}</span></td>
              {data.players.map((p) => {
                const v = r.deltas[p];
                return (
                  <td key={p} className={v > 0 ? "pos" : v < 0 ? "neg" : "muted"}>
                    {v ? signedMoney(v) : "·"}
                  </td>
                );
              })}
              <td className="note">{r.note}</td>
              <td className="actions">
                {r.deletedAt ? (
                  <button className="mini" onClick={async () => {
                    await LocalStore.restoreEvent(String(r.id), env); onChange();
                  }}>restore</button>
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
    </section>
  );
}

function Pnl({ data }: { data: PokerData }) {
  const years = gameYears(data);
  const players = data.players;
  const perYear = years.map((y) => ({ y, vals: pokerPnl(data, y) }));
  const allTime = pokerPnl(data);

  return (
    <section>
      <h2>Profit &amp; Loss</h2>
      <table className="grid">
        <thead>
          <tr><th>Year</th>{players.map((p) => <th key={p}>{p}</th>)}</tr>
        </thead>
        <tbody>
          {perYear.map(({ y, vals }) => (
            <StatRow key={y} label={String(y)} values={vals} players={players} />
          ))}
          <tr className="total">
            <th>All-time</th>
            {players.map((p) => (
              <td key={p} className={allTime[p] > 0 ? "pos" : allTime[p] < 0 ? "neg" : ""}>
                {signedMoney(allTime[p])}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
      <p className="hint">Poker games only; side bets and settlements excluded.</p>
    </section>
  );
}

function Chips({ data }: { data: PokerData }) {
  const proposal = useMemo(() => proposeNextChips(data), [data]);
  return (
    <section>
      <h2>Chips for the next game</h2>
      <table className="grid">
        <thead>
          <tr><th>Player</th><th>Stack</th><th>Loss streak</th><th>Why</th></tr>
        </thead>
        <tbody>
          {data.players.map((p) => (
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
        Derived by replaying every recorded game — undo any past result and this
        recomputes. Band {fmtChips(data.config.chipMin)}–{fmtChips(data.config.chipMax)};
        win −{data.config.winDecrement}, 2nd −{data.config.secondDecrement},
        lose-{data.config.lossStreakForIncrement} +{data.config.lossIncrement}.
      </p>
    </section>
  );
}

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

  const preview = useMemo(() => {
    if (!inputs) return null;
    try {
      const e = buildGameEvent(inputs, {
        id: "preview", date: gameDate, config: data.config, players, env,
      });
      const next = proposeNextChips(
        { ...data, events: [...data.events, e] });
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
          <tr><th>Player</th><th>Playing</th>{kind === "main" && <th>Rebuys</th>}<th>1st</th>
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
            <thead><tr><th></th>{players.map((p) => <th key={p}>{p}</th>)}</tr></thead>
            <tbody>
              <StatRow label="Money" values={
                Object.fromEntries(players.map((p) => [p, preview.deltas[p] ?? 0]))
              } players={players} />
              {kind === "main" && (
                <tr>
                  <th>Next chips</th>
                  {players.map((p) => (
                    <td key={p}>{preview.next.chips[p] == null ? "—" : fmtChips(preview.next.chips[p])}</td>
                  ))}
                </tr>
              )}
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
        Split 1st = tick multiple winners. {money(data.config.mainEntry)} entry per
        buy-in; pot and payouts ({entrants.length === 6 ? "65/35" : "winner takes all"})
        are computed automatically. Everything saved here can be undone from History.
      </p>
    </section>
  );
}
