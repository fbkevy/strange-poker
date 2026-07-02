// Rules — mechanical game settings (editable) + house rules (editable text).

import { useEffect, useState } from "react";
import type { Config, PokerData } from "../types";
import type { Env } from "../engine/replay";
import type { Store } from "../store";

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

export function Rules({ data, env, store, onChange }: {
  data: PokerData; env: Env; store: Store; onChange: () => void;
}) {
  const [cfg, setCfg] = useState<Config>(data.config);
  const [rules, setRules] = useState<string[]>([]);
  const [newRule, setNewRule] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => { store.getRules(env).then(setRules); }, [env, store]);
  useEffect(() => { setCfg(data.config); }, [data.config]);

  async function saveConfig() {
    await store.saveConfig(cfg, env);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
    onChange();
  }

  async function saveRules(next: string[]) {
    setRules(next);
    await store.saveRules(next, env);
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
