-- Poker Fund — Supabase schema
-- Run in Supabase → SQL editor. Friends-only app; keep the anon key private-ish.

create table if not exists players (
  id    text primary key,          -- "Dec", "Pauli", ...
  name  text not null,
  active boolean not null default true,
  sort  int not null default 0
);

create table if not exists config (
  key   text primary key,
  value jsonb not null
);

create table if not exists events (
  id      uuid primary key default gen_random_uuid(),
  date    date,                     -- null for legacy rows with unknown date
  type    text not null,           -- main|after|in_person|bet|bonus|settle|misc
  block   text not null default 'game',
  note    text not null default '',
  deltas  jsonb not null,          -- { "Dec": -20, ... } zero-sum
  chips   jsonb,                    -- main games: starting stacks, else null
  buyins  jsonb,                    -- main games: rebuy counts, else null
  src_row int,                      -- provenance from the original sheet
  created_at timestamptz not null default now()
);

create index if not exists events_date_idx on events(date);
create index if not exists events_type_idx on events(type);

-- Loss-streak state per player is derived by replaying main games, so it is not
-- stored; the engine recomputes it. (Add a materialized cache later if needed.)

-- RLS: simplest friends-only setup — enable RLS and allow the anon role full
-- access. Tighten later (e.g. a shared passphrase via an edge function) if you
-- ever make the anon key public.
alter table players enable row level security;
alter table config  enable row level security;
alter table events  enable row level security;

create policy anon_all_players on players for all using (true) with check (true);
create policy anon_all_config  on config  for all using (true) with check (true);
create policy anon_all_events  on events  for all using (true) with check (true);
