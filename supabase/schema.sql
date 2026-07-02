-- Strange Poker — Supabase schema
-- Paste into Supabase dashboard → SQL editor → Run. Idempotent.

create table if not exists events (
  id         text primary key,          -- legacy rows keep sheet row numbers; new rows use uuids
  env        text not null default 'prod' check (env in ('prod','test')),
  date       date,                      -- null for legacy rows with unknown date
  type       text not null,             -- main|after|in_person|bet|bonus|settle|misc
  block      text not null default 'game' check (block in ('game','ledger')),
  note       text not null default '',
  deltas     jsonb not null,            -- { "Dec": -20, ... } zero-sum
  chips      jsonb,                     -- legacy main games: starting-stack snapshot
  buyins     jsonb,                     -- main games: rebuy counts
  inputs     jsonb,                     -- app-created games: raw wizard inputs
  src_row    int,                       -- provenance from the original sheet
  deleted_at timestamptz,               -- soft delete = undo
  created_at timestamptz not null default now()
);

create index if not exists events_env_date_idx on events(env, date);

-- Settings, house rules, per-env tombstones, player list — all as k/v jsonb.
create table if not exists config (
  key        text primary key,          -- 'players', 'prod.config', 'test.rules', 'test.tombstones', ...
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

-- RLS: friends-only app — the publishable key gets full access.
-- (Anyone who extracts the key from the site JS could write; acceptable for now.)
alter table events enable row level security;
alter table config enable row level security;

drop policy if exists anon_all_events on events;
drop policy if exists anon_all_config on config;
create policy anon_all_events on events for all using (true) with check (true);
create policy anon_all_config on config for all using (true) with check (true);

-- Realtime change feed for live sync between phones.
do $$ begin
  alter publication supabase_realtime add table events;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table config;
exception when duplicate_object then null; end $$;
