// App shell: backend resolution, env switch, tab routing, live sync.

import { useCallback, useEffect, useState } from "react";
import type { PokerData } from "./types";
import { resolveStore, type ResolvedStore } from "./store";
import type { Env } from "./engine/replay";
import { Dashboard } from "./components/Dashboard";
import { History } from "./components/History";
import { Pnl } from "./components/Pnl";
import { Chips } from "./components/Chips";
import { NewGame } from "./components/NewGame";
import { Pay } from "./components/Pay";
import { Bet } from "./components/Bet";
import { Rules } from "./components/Rules";

type Tab = "dashboard" | "history" | "pnl" | "chips" | "newgame" | "pay" | "bet" | "rules";

const TABS: [Tab, string][] = [
  ["dashboard", "♠ Home"], ["history", "♣ History"], ["pnl", "♦ P&L"],
  ["chips", "♥ Chips"], ["newgame", "+ Game"], ["pay", "€ Pay"],
  ["bet", "± Bet"], ["rules", "Rules"],
];

export function App() {
  const [env, setEnv] = useState<Env>(
    () => (localStorage.getItem("sp.env") as Env) || "prod"
  );
  const [data, setData] = useState<PokerData | null>(null);
  const [tab, setTab] = useState<Tab>("dashboard");
  const [resolved, setResolved] = useState<ResolvedStore | null>(null);

  const reload = useCallback(() => {
    resolved?.store.getData(env).then(setData)
      .catch((e) => console.error("[SP] load failed", e));
  }, [resolved, env]);

  // Resolve the backend once at startup.
  useEffect(() => {
    let cancelled = false;
    resolveStore().then((r) => { if (!cancelled) setResolved(r); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    localStorage.setItem("sp.env", env);
    reload();
  }, [env, reload]);

  // Live sync: refresh whenever another phone writes.
  useEffect(() => {
    if (resolved?.mode !== "cloud" || !resolved.store.subscribe) return;
    return resolved.store.subscribe(reload);
  }, [resolved, reload]);

  if (!data || !resolved) return <div className="loading">Loading Strange Poker…</div>;
  const { store, mode } = resolved;

  return (
    <div className={`app env-${env}`}>
      {env === "test" && (
        <div className="test-banner">
          TEST MODE — nothing here touches the real history.{" "}
          <button
            onClick={async () => {
              if (confirm("Reset test data back to a clean copy of prod?")) {
                await store.resetTest();
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
        {tab === "history" && <History data={data} env={env} store={store} onChange={reload} />}
        {tab === "pnl" && <Pnl data={data} />}
        {tab === "chips" && <Chips data={data} />}
        {tab === "newgame" && (
          <NewGame data={data} env={env} store={store} onSaved={() => { reload(); setTab("chips"); }} />
        )}
        {tab === "pay" && (
          <Pay data={data} env={env} store={store} onSaved={() => { reload(); setTab("dashboard"); }} />
        )}
        {tab === "bet" && (
          <Bet data={data} env={env} store={store} onSaved={() => { reload(); setTab("history"); }} />
        )}
        {tab === "rules" && <Rules data={data} env={env} store={store} onChange={reload} />}
      </main>
      <footer>
        {data.events.filter((e) => !e.deletedAt).length} events · SP · {env} ·{" "}
        {mode === "cloud" ? "☁ live" : "this device only"}
        <span className="suits">♠♥♦♣</span>
      </footer>
    </div>
  );
}
