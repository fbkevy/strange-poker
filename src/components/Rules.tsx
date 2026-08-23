// Rules — mechanical game settings (editable), house rules, and tips.

import { useEffect, useState } from "react";
import type { Config, PokerData } from "../types";
import type { Env } from "../engine/replay";
import type { Store } from "../store";
import type { ListName } from "../store/types";

const CONFIG_FIELDS: [keyof Config, string][] = [
  ["mainEntry", "Main game entry (€)"],
  ["afterEntry", "Quick game default entry (€)"],
  ["secondPlaceShare", "2nd place share of pot (6 players)"],
  ["winDecrement", "Chips off next game for winning"],
  ["secondDecrement", "Chips off next game for 2nd"],
  ["lossIncrement", "Chips added after losing streak"],
  ["lossStreakForIncrement", "Losses in a row to trigger it"],
  ["chipMin", "Minimum stack"],
  ["chipMax", "Maximum stack"],
];

/** Free-form add/remove list, shared by House rules and Tips. */
function EditableList({ name, title, placeholder, hint, env, store }: {
  name: ListName; title: string; placeholder: string; hint: string;
  env: Env; store: Store;
}) {
  const [items, setItems] = useState<string[]>([]);
  const [draft, setDraft] = useState("");

  useEffect(() => { store.getList(name, env).then(setItems); }, [name, env, store]);

  async function commit(next: string[]) {
    setItems(next);
    await store.saveList(name, next, env);
  }

  function add() {
    const text = draft.trim();
    if (!text) return;
    commit([...items, text]);
    setDraft("");
  }

  return (
    <>
      <h2>{title}</h2>
      {items.length === 0 && <p className="hint">Nothing here yet — add the first one below.</p>}
      <ul className="rules-list">
        {items.map((r, i) => (
          <li key={i}>
            <span>{r}</span>
            <button className="mini" onClick={() => commit(items.filter((_, j) => j !== i))}>
              remove
            </button>
          </li>
        ))}
      </ul>
      <div className="form-row">
        <input className="wide" placeholder={placeholder} value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") add(); }} />
        <button className="mini" onClick={add}>add</button>
      </div>
      <p className="hint">{hint}</p>
    </>
  );
}

export function Rules({ data, env, store, onChange }: {
  data: PokerData; env: Env; store: Store; onChange: () => void;
}) {
  const [cfg, setCfg] = useState<Config>(data.config);
  const [saved, setSaved] = useState(false);

  useEffect(() => { setCfg(data.config); }, [data.config]);

  async function saveConfig() {
    await store.saveConfig(cfg, env);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
    onChange();
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
        {" "}The Quick game entry is only a default — you set the real stake when
        recording each game.
      </p>

      <EditableList
        name="rules" title="House rules" env={env} store={store}
        placeholder="Add a house rule…"
        hint="Informational reminders (bonuses, table etiquette). The mechanical ones above are what the app actually computes with." />

      <EditableList
        name="tips" title="Tips" env={env} store={store}
        placeholder="Add a tip…"
        hint="Anything worth remembering — strategy, reminders, running jokes." />
    </section>
  );
}
