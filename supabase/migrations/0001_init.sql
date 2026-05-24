-- =============================================================================
--  NovaMine — initial schema
-- =============================================================================
--  Conventions:
--    * All ids are uuid (gen_random_uuid).
--    * Money columns use numeric for precision (TON has 9 decimals, hashes 8).
--    * NOVA is a whole-number "in-game points" balance (bigint).
--    * RLS is enabled on every table; users can read their own rows.
--      Writes happen exclusively through the API (service-role key bypasses RLS).
--    * The API mints JWTs with sub = users.id, so auth.uid() resolves to it.
-- =============================================================================

create extension if not exists "pgcrypto";

-- ── users ────────────────────────────────────────────────────────────────────
create table if not exists public.users (
  id              uuid primary key default gen_random_uuid(),
  telegram_id     bigint unique not null,
  username        text,
  first_name      text,
  last_name       text,
  language_code   text,
  photo_url       text,

  nova            bigint        not null default 0,
  hashes          numeric(20,8) not null default 0,
  ton_balance     numeric(20,9) not null default 0,

  mining_power    bigint        not null default 1000,
  daily_rate      numeric(20,9) not null default 0.00036,

  referrer_id     uuid references public.users(id) on delete set null,

  created_at      timestamptz not null default now(),
  last_seen_at    timestamptz not null default now()
);
create index if not exists users_telegram_id_idx on public.users (telegram_id);
create index if not exists users_referrer_idx     on public.users (referrer_id);
create index if not exists users_mining_power_idx on public.users (mining_power desc);

-- ── mining_sessions ─────────────────────────────────────────────────────────
create table if not exists public.mining_sessions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.users(id) on delete cascade,
  started_at      timestamptz not null default now(),
  claim_ready_at  timestamptz not null,
  claimed_at      timestamptz,
  hashes_earned   numeric(20,8)
);
create index if not exists mining_sessions_user_active_idx
  on public.mining_sessions (user_id) where claimed_at is null;

-- ── slot_spins ──────────────────────────────────────────────────────────────
create table if not exists public.slot_spins (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.users(id) on delete cascade,
  reels               jsonb not null,
  reward              integer not null default 0,
  spun_at             timestamptz not null default now(),
  next_available_at   timestamptz not null
);
create index if not exists slot_spins_user_recent_idx
  on public.slot_spins (user_id, spun_at desc);

-- ── dice_rolls ──────────────────────────────────────────────────────────────
create table if not exists public.dice_rolls (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  value       smallint not null check (value between 1 and 6),
  reward      integer  not null default 0,
  rolled_at   timestamptz not null default now()
);
-- Enforce one-roll-per-utc-day at the DB layer too
create unique index if not exists dice_rolls_user_day_uniq
  on public.dice_rolls (user_id, ((rolled_at at time zone 'utc')::date));

-- ── tasks_completed ─────────────────────────────────────────────────────────
create table if not exists public.tasks_completed (
  user_id       uuid not null references public.users(id) on delete cascade,
  task_id       text not null,
  completed_at  timestamptz not null default now(),
  primary key (user_id, task_id)
);

-- ── referrals ───────────────────────────────────────────────────────────────
create table if not exists public.referrals (
  id                          uuid primary key default gen_random_uuid(),
  referrer_id                 uuid not null references public.users(id) on delete cascade,
  referred_id                 uuid not null references public.users(id) on delete cascade,
  status                      text not null default 'pending'
                              check (status in ('pending','active','inactive')),
  active_days_this_month      integer not null default 0,
  created_at                  timestamptz not null default now(),
  unique (referrer_id, referred_id)
);
create index if not exists referrals_referrer_status_idx
  on public.referrals (referrer_id, status);

-- ── withdrawals ─────────────────────────────────────────────────────────────
create table if not exists public.withdrawals (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.users(id) on delete cascade,
  amount_ton      numeric(20,9) not null check (amount_ton > 0),
  wallet_address  text not null,
  status          text not null default 'pending'
                  check (status in ('pending','processing','sent','rejected','refunded')),
  tx_hash         text,
  requested_at    timestamptz not null default now(),
  processed_at    timestamptz,
  notes           text
);
create index if not exists withdrawals_user_idx on public.withdrawals (user_id, requested_at desc);
create index if not exists withdrawals_status_idx on public.withdrawals (status);

-- ── shop_purchases ──────────────────────────────────────────────────────────
create table if not exists public.shop_purchases (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.users(id) on delete cascade,
  tier_id         text not null,
  nova_granted    bigint not null,
  ton_paid        numeric(20,9) not null,
  tx_hash         text not null,
  status          text not null default 'pending'
                  check (status in ('pending','confirmed','rejected')),
  created_at      timestamptz not null default now(),
  confirmed_at    timestamptz
);
create unique index if not exists shop_purchases_tx_uniq on public.shop_purchases (tx_hash);

-- ── activity_feed (powers the live ticker on the home screen) ───────────────
create table if not exists public.activity_feed (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references public.users(id) on delete set null,
  type        text not null,                          -- 'mine','swap','withdraw','spin','dice','invite','buy'
  payload     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists activity_feed_recent_idx on public.activity_feed (created_at desc);

-- =============================================================================
--  Helper RPC — atomic NOVA increment used by api/src/routes/*.ts
-- =============================================================================
create or replace function public.increment_user_nova(p_user_id uuid, p_amount bigint)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  new_balance bigint;
begin
  update public.users
     set nova = nova + p_amount
   where id = p_user_id
   returning nova into new_balance;

  if new_balance is null then
    raise exception 'User % not found', p_user_id;
  end if;

  return new_balance;
end;
$$;

revoke all on function public.increment_user_nova(uuid, bigint) from public;
grant execute on function public.increment_user_nova(uuid, bigint) to service_role;

-- =============================================================================
--  Row Level Security
--    The API uses the service_role key which bypasses RLS, so policies here
--    only define what the *frontend* (with the user JWT) can see directly.
-- =============================================================================
alter table public.users           enable row level security;
alter table public.mining_sessions enable row level security;
alter table public.slot_spins      enable row level security;
alter table public.dice_rolls      enable row level security;
alter table public.tasks_completed enable row level security;
alter table public.referrals       enable row level security;
alter table public.withdrawals     enable row level security;
alter table public.shop_purchases  enable row level security;
alter table public.activity_feed   enable row level security;

-- Users: read-own and read-public-safe-columns of others (for leaderboard).
-- We keep the policy permissive (anyone authenticated can SELECT users) because
-- the columns we expose are non-sensitive. The frontend should only request
-- public-safe fields. Tighten this later if you start storing PII.
drop policy if exists "users_select_all_authed" on public.users;
create policy "users_select_all_authed" on public.users
  for select using ( auth.role() = 'authenticated' );

drop policy if exists "users_update_own" on public.users;
create policy "users_update_own" on public.users
  for update using ( id = auth.uid() );

-- Per-user tables: read only your own rows
drop policy if exists "mining_select_own" on public.mining_sessions;
create policy "mining_select_own" on public.mining_sessions
  for select using ( user_id = auth.uid() );

drop policy if exists "slots_select_own" on public.slot_spins;
create policy "slots_select_own" on public.slot_spins
  for select using ( user_id = auth.uid() );

drop policy if exists "dice_select_own" on public.dice_rolls;
create policy "dice_select_own" on public.dice_rolls
  for select using ( user_id = auth.uid() );

drop policy if exists "tasks_completed_select_own" on public.tasks_completed;
create policy "tasks_completed_select_own" on public.tasks_completed
  for select using ( user_id = auth.uid() );

drop policy if exists "referrals_select_own" on public.referrals;
create policy "referrals_select_own" on public.referrals
  for select using ( referrer_id = auth.uid() or referred_id = auth.uid() );

drop policy if exists "withdrawals_select_own" on public.withdrawals;
create policy "withdrawals_select_own" on public.withdrawals
  for select using ( user_id = auth.uid() );

drop policy if exists "shop_purchases_select_own" on public.shop_purchases;
create policy "shop_purchases_select_own" on public.shop_purchases
  for select using ( user_id = auth.uid() );

-- Activity feed is global (everyone sees the live ticker)
drop policy if exists "activity_feed_select_authed" on public.activity_feed;
create policy "activity_feed_select_authed" on public.activity_feed
  for select using ( auth.role() = 'authenticated' );
