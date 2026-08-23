// App shell: backend resolution, env switch, tab routing, live sync.

import { useCallback, useEffect, useState } from "react";
import type { PokerData } from "./types";
import {
  resolveStore, pendingLocal, clearPendingLocal, pushPendingToCloud,
  type ResolvedStore,
} from "./store";
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
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const reload = useCallback(() => {
    resolved?.store.getData(env).then(setData)
      .catch((e) => console.error("[SP] load failed", e));
    setPending(pendingLocal(env).count);
  }, [resolved, env]);

  const connect = useCallback(async () => {
    setRetrying(true);
    try {
      setResolved(await resolveStore());
    } finally {
      setRetrying(false);
    }
  }, []);

  // Resolve the backend at startup, and again whenever the tab regains focus
  // (so a paused project that has been resumed reconnects without a reload).
  useEffect(() => {
    connect();
    const onFocus = () => { if (document.visibilityState === "visible") connect(); };
    document.addEventListener("visibilitychange", onFocus);
    return () => document.removeEventListener("visibilitychange", onFocus);
  }, [connect]);

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
  const offline = mode === "offline";

  async function sync() {
    setSyncing(true);
    try {
      const { pushed, failed } = await pushPendingToCloud(env);
      if (failed.length) {
        alert(`Pushed ${pushed}, but ${failed.length} failed:\n` +
          failed.map((f) => `${f.id}: ${f.error}`).join("\n") +
          `\n\nThey are still saved on this device — try again.`);
      } else {
        alert(pushed === 1
          ? "Pushed 1 entry to the cloud. Everyone can see it now."
          : `Pushed ${pushed} entries to the cloud. Everyone can see them now.`);
      }
      await connect();
      reload();
    } catch (e) {
      alert(`Sync failed: ${e}\n\nNothing was lost — your entries are still on this device.`);
    } finally {
      setSyncing(false);
    }
  }

  function discard() {
    if (!confirm(
      `Permanently delete the ${pending} unsynced entr${pending === 1 ? "y" : "ies"} ` +
      `held on this device?\n\nOnly do this if they are already in the History — ` +
      `otherwise they are gone for good.`
    )) return;
    clearPendingLocal(env);
    reload();
  }

  return (
    <div className={`app env-${env}`}>
      {offline && (
        <div className="alert-banner" role="alert">
          <strong>⚠ NOT SAVING TO THE CLOUD</strong>
          <span>{resolved.error}</span>
          <span>
            Anything you record now stays on <em>this device only</em> and the
            others won't see it. Figures below may be out of date.
          </span>
          <button onClick={connect} disabled={retrying}>
            {retrying ? "Trying…" : "Retry connection"}
          </button>
        </div>
      )}

      {pending > 0 && (
        <div className="warn-banner" role="alert">
          <strong>
            {pending === 1
              ? "1 entry on this device is not in the cloud"
              : `${pending} entries on this device are not in the cloud`}
          </strong>
          <span>Recorded while the database was unavailable. Push them so everyone sees them.</span>
          <div className="banner-actions">
            <button onClick={sync} disabled={offline || syncing}>
              {syncing ? "Pushing…" : offline ? "Cloud still down" : "Push to cloud"}
            </button>
            <button className="ghost" onClick={discard} disabled={syncing}>
              Discard
            </button>
          </div>
          <span className="fineprint">
            Discard only if these are already in the History below — someone may
            have entered them another way.
          </span>
        </div>
      )}

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
          <NewGame data={data} env={env} store={store} offline={offline}
            onSaved={() => { reload(); setTab("chips"); }} />
        )}
        {tab === "pay" && (
          <Pay data={data} env={env} store={store} offline={offline}
            onSaved={() => { reload(); setTab("dashboard"); }} />
        )}
        {tab === "bet" && (
          <Bet data={data} env={env} store={store} offline={offline}
            onSaved={() => { reload(); setTab("history"); }} />
        )}
        {tab === "rules" && <Rules data={data} env={env} store={store} onChange={reload} />}
      </main>
      <footer>
        {data.events.filter((e) => !e.deletedAt).length} events · SP · {env} ·{" "}
        <span className={offline ? "neg" : ""}>
          {offline ? "⚠ OFFLINE — this device only" : "☁ live"}
        </span>
        <span className="suits">♠♥♦♣</span>
      </footer>
    </div>
  );
}
