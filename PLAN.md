# Poker Fund — Web App Plan

## Context

Six friends (Dec, Pauli, Kev, Caoimh, Dave, Fran) run poker nights and have
tracked money, handicaps, and side debts in a Google Sheet ("Poker fund.xlsx",
`Poker` tab) for years. The sheet is a single **zero-sum ledger**: each row is a
money event whose six player columns sum to 0. It also encodes a **handicap chip
system** and various side pots/bonuses.

Goal: replace the sheet with a web app that (a) preserves all history, (b) makes
recording a game night fast and correct, (c) auto-computes handicap chips and
payouts, and (d) shows history + P&L clearly. Data must be **backed up / in Git**.

Decisions already made with the user:
- **Persistence:** Supabase (hosted Postgres) as the live store, with periodic
  JSON export committed to Git for backup/versioning.
- **Handicap:** auto-compute the next-game chip stacks, with manual override.
- **Scope:** full-ledger parity (games, €5 after-games, side bets, money
  bonuses, settlements, misc debts) so Outstanding & P&L always reconcile.
- **Localization:** all dates/times/numbers render in the *user's* locale and
  timezone (`Intl.*`); timestamps stored as UTC ISO. Money is EUR.

## Data model (validated against the sheet)

The importer already reproduces the sheet's own P&L and Outstanding totals **to
the cent** (226 events, zero bad checksums). Canonical event shape:

```jsonc
{
  "id": "uuid",
  "date": "2020-11-07",          // ISO date (UTC-safe); time optional
  "type": "main|after|bet|bonus|settle|misc|in_person",
  "block": "game|ledger",        // sheet's positional P&L split (row>=43 = game)
  "note": "",
  "deltas": { "Dec": -20, ... }, // EUR, zero-sum across the 6 players
  "chips":  { "Dec": 5000, ... } | null,  // main games only: starting stacks
  "buyins": { "Dec": 0, ... }    | null   // main games only: rebuy counts
}
```

Definitions the app uses (cleaner than the sheet's stale ranges):
- **Outstanding[p]** = sum of *all* event deltas for p (true running balance).
- **Poker P&L[p]** = sum of deltas where `block == "game"`.
- **Per-year / YTD P&L** = the same, filtered by the event's actual date
  (fixes the sheet's overlapping-range bug at row 171).

`config` (editable in-app): `chipMin`, `chipMax`, `winDecrement` (500),
`secondDecrement` (250), `lossIncrement` (500), `lossStreakForIncrement` (3),
`mainEntry` (20), `afterEntry` (5), `secondPlaceShare` (0.35),
`straightFlushBonus` (5), `royalFlushBonus` (10).

## Rules engine (pure functions, unit-tested against real rows)

**Payout** (given a finished game): pot = sum(entries + rebuys × buyin value).
- 6 players → 1st gets 65%, 2nd gets 35%.
- < 6 players → 1st takes the pot.
- €5 after-game → 1st only (no 2nd), per the note.
- Produces the zero-sum `deltas` map: winners get pot share minus own outlay,
  everyone else = −(their outlay).

**Handicap** (main games only; €5 games ignored): starting from each player's
current stack, for the *next* main game —
- winner (1st): −`winDecrement` (500).
- 2nd place: −`secondDecrement` (250).
- a split of 1st: split the decrement across the tied winners.
- a player who has now lost `lossStreakForIncrement` (3) in a row — **no-shows
  count as losses** — gets +`lossIncrement` (500), then their streak resets.
- clamp every stack to `[chipMin, chipMax]`.
- Engine returns proposed stacks; the entry screen lets the host override.

**Confirmed rules (user decisions, 2026-07-01):** these follow the sheet's
*note*, which in places differs from historical play — the app encodes the note.
- Payout: 6-player main = **65/35**; <6 main = winner-takes-all; €5 = 1st only.
- Handicap: win **−500**; 2nd **−250**; a split of a place shares that place's
  decrement equally; lose-streak of **3** (no-shows count) = **+500**, then reset.
- Clamps: hard **6,000–9,000** for everyone going forward.

> Empirical note (for reference): history actually shows winners taking the whole
> pot, 2nd usually breaking even, and per-player stack ranges wider than 6k–9k.
> The user chose the written rules over historical behaviour.

## Architecture

- **Static SPA**, **React + Vite + TypeScript**, deployed free (GitHub Pages or
  Netlify). No custom server.
- **Store abstraction** (`Store` interface) with two implementations:
  - `LocalStore` — reads bundled `data.json`, writes to `localStorage`, supports
    JSON export/import. Lets the whole app run before Supabase exists.
  - `SupabaseStore` — reads/writes Supabase tables; realtime subscription so
    multiple phones stay in sync during a game night.
- **Backup:** a scheduled/one-click export dumps the ledger to `data/data.json`
  and commits it (GitHub Action or manual `export` button + token), satisfying
  the "in Git" requirement.
- **Localization:** central `format.ts` using `Intl.DateTimeFormat` (user TZ)
  and `Intl.NumberFormat(locale, {style:'currency', currency:'EUR'})`.

### Supabase schema
- `players(id, name, active, sort)`
- `events(id, date, type, block, note, deltas jsonb, chips jsonb, buyins jsonb, created_at)`
- `config(key, value jsonb)` (single row of settings)
- Simple RLS: a shared group passphrase / anon-key access (friends-only app,
  not sensitive). Finalize auth model when the project is created.

## App screens

1. **Dashboard** — Outstanding balances (who owes whom), YTD P&L, last night's results.
2. **History** — filterable table (by year, player, type). Localized dates/money.
   Row detail shows chips/buyins for games.
3. **P&L** — all-time, per-year, YTD; per-player trend chart.
4. **Chips for next game** — current proposed stacks per player (from the engine),
   with the reasoning ("−500: won last game"), editable.
5. **Record a game** — wizard: pick session type (€20 main / €5 after), who's
   playing/paying, rebuys, finishing order → engine computes deltas + next chips
   → review → save (appends event, updates balances).
6. **Ledger entry** — quick add for settlements, side bets, bonuses, misc debts.
7. **Settings** — edit config (clamps/steps/splits), players, export/backup.

## Milestones

- [x] **M0 — Importer & data model** — xlsx → `data.json`, validated to the cent.
- [ ] **M1 — Rules engine** — payout + handicap pure funcs + unit tests.
- [ ] **M2 — Local app** — all screens working on `LocalStore` (bundled JSON).
- [ ] **M3 — Supabase** — schema + `SupabaseStore` + realtime + Git backup export.
- [ ] **M4 — Deploy & polish** — hosting, localization pass, mobile layout.

## Open questions / needs from user
1. Project location — new `Poker Fund` folder (current) vs its own Git repo?
2. Supabase project URL + anon key (when ready).
3. Confirm handicap numbers (clamps, steps, streak reset).
4. Any players beyond the six (e.g. Fergal appears in Reputation tab)?
5. Preferred host: GitHub Pages vs Netlify.
