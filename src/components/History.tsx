// History — filterable ledger table with CSV export and undo/restore.

import { useMemo, useState } from "react";
import type { PokerData } from "../types";
import type { Env } from "../engine/replay";
import type { Store } from "../store";
import { signedMoney, date } from "../format";
import { gameYears, history } from "../engine/selectors";
import { TYPE_LABEL, signClass } from "./shared";

export function History({ data, env, store, onChange }: {
  data: PokerData; env: Env; store: Store; onChange: () => void;
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
                    <td key={p} className={signClass(v, "muted")}>
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
                      await store.restoreEvent(String(r.id), env); onChange();
                    }}>↩ redo</button>
                  ) : (
                    <button className="mini" onClick={async () => {
                      if (confirm("Undo this entry? All chip calcs and totals recompute without it.")) {
                        await store.deleteEvent(String(r.id), env); onChange();
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
