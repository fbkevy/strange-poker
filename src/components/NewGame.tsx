// New game wizard — preview shows money deltas and chips before → after.

import { useMemo, useState } from "react";
import type { GameInputs, PokerData } from "../types";
import type { Env } from "../engine/replay";
import type { Store } from "../store";
import { signedMoney, chips as fmtChips } from "../format";
import { buildGameEvent, proposeNextChips } from "../engine/replay";
import { signClass } from "./shared";

export function NewGame({ data, env, store, onSaved }: {
  data: PokerData; env: Env; store: Store; onSaved: () => void;
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

  const inputs: GameInputs | null = useMemo(() => {
    if (first.length === 0) return null;
    const ins = players.filter((p) => playing[p]);
    const outs = kind === "main" ? players.filter((p) => !playing[p]) : [];
    return {
      kind,
      entrants: ins.map((p) => ({ player: p, rebuys: rebuys[p] ?? 0 })),
      first,
      second: kind === "main" && ins.length === 6 && second.length ? second : undefined,
      noShows: outs.length ? outs : undefined,
    };
  }, [kind, playing, rebuys, first, second, players]);

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
  }, [inputs, gameDate, data, players, env]);

  async function save() {
    if (!inputs) { setErr("Pick at least a winner."); return; }
    if (first.some((p) => !playing[p]) || second.some((p) => !playing[p])) {
      setErr("Winner/2nd must be playing."); return;
    }
    const e = buildGameEvent(inputs, {
      id: crypto.randomUUID(), date: gameDate, config: data.config, players, env, note,
    });
    await store.addEvent(e, env);
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
                    <td className={signClass(d, "muted")}>
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
