-- Run this in your Supabase SQL Editor

-- Users table
create table if not exists users (
  id uuid default gen_random_uuid() primary key,
  email text unique not null,
  name text,
  avatar_url text,
  created_at timestamptz default now()
);

-- Teams table
create table if not exists teams (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  created_by uuid references users(id) on delete cascade,
  created_at timestamptz default now()
);

-- Team members table
create table if not exists team_members (
  team_id uuid references teams(id) on delete cascade,
  user_id uuid references users(id) on delete cascade,
  role text default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz default now(),
  primary key (team_id, user_id)
);

-- Payments table
create table if not exists payments (
  id uuid default gen_random_uuid() primary key,
  team_id uuid references teams(id) on delete cascade,
  user_id uuid references users(id) on delete cascade not null,
  name text not null,
  amount numeric(12,2) not null,
  start_date date not null,
  day_of_month integer not null check (day_of_month between 1 and 31),
  total_installments integer not null check (total_installments > 0),
  paid_installments integer default 0 check (paid_installments >= 0),
  created_at timestamptz default now()
);

-- Assets table (economy page)
create table if not exists assets (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references users(id) on delete cascade not null,
  team_id uuid references teams(id) on delete cascade,
  bank_name text not null,
  currency text not null check (currency in ('USD', 'EUR', 'GBP', 'TRY', 'BILEZIK', 'GRAM_ALTIN', 'CEYREK_ALTIN', 'YARIM_ALTIN', 'TAM_ALTIN')),
  amount numeric(20, 4) not null check (amount >= 0),
  created_at timestamptz default now()
);

-- color column for users (added after initial schema)
alter table users add column if not exists color text;

-- currency column for payments (added after initial schema)
alter table payments add column if not exists currency text not null default 'TRY';

-- Recurring payments (monthly reminders, separate from installment payments)
create table if not exists recurring_payments (
  id uuid default gen_random_uuid() primary key,
  team_id uuid references teams(id) on delete cascade,
  user_id uuid references users(id) on delete cascade not null,
  name text not null,
  currency text not null default 'TRY',
  day_of_month integer not null check (day_of_month between 1 and 31),
  start_month date not null,
  end_month date,
  created_at timestamptz default now()
);

-- Per-month amount/paid state for a recurring payment
create table if not exists recurring_entries (
  id uuid default gen_random_uuid() primary key,
  recurring_id uuid references recurring_payments(id) on delete cascade not null,
  period date not null,
  amount numeric(12,2),
  is_paid boolean not null default false,
  paid_at timestamptz,
  created_at timestamptz default now(),
  unique (recurring_id, period)
);
-- multi-currency amount lines: [{"currency":"USD","amount":100}, ...] (takes precedence over `amount`)
alter table recurring_entries add column if not exists amounts jsonb;

-- Per-installment overrides for installment payments (specific date/amount)
create table if not exists payment_overrides (
  id uuid default gen_random_uuid() primary key,
  payment_id uuid references payments(id) on delete cascade not null,
  installment_index integer not null check (installment_index >= 0),
  due_date date,
  amount numeric(12,2),
  created_at timestamptz default now(),
  unique (payment_id, installment_index)
);
-- multi-currency override lines: [{"currency":"USD","amount":100}, ...] (takes precedence over `amount`)
alter table payment_overrides add column if not exists amounts jsonb;

-- due_date column for recurring entries (per-month date override; added after initial schema)
alter table recurring_entries add column if not exists due_date date;

-- Forward-effective day-of-month changes for a recurring series (applied from a given
-- month onward). Array of {"from":"yyyy-MM-01","day":N}; the latest change with from<=period
-- wins, else the base day_of_month. Lets "change the day for this and following months"
-- keep a single series row without rewriting history.
alter table recurring_payments add column if not exists day_changes jsonb;

-- Enable Row Level Security
alter table users enable row level security;
alter table teams enable row level security;
alter table team_members enable row level security;
alter table payments enable row level security;
alter table assets enable row level security;
alter table payment_overrides enable row level security;
alter table recurring_payments enable row level security;
alter table recurring_entries enable row level security;

-- RLS Policies: service role bypasses all (used by API)
-- Users can read themselves
create policy "Users can read own profile"
  on users for select using (true);

create policy "Service role can manage users"
  on users for all using (true);

-- Teams: members can read their teams
create policy "Team members can view teams"
  on teams for select
  using (
    id in (select team_id from team_members where user_id = (
      select id from users where email = current_setting('request.jwt.claims', true)::json->>'email'
    ))
  );

-- Payments: team members can see team payments
create policy "Team members can view payments"
  on payments for select using (true);

create policy "Authenticated users can insert payments"
  on payments for insert with check (true);

create policy "Users can update their own payments"
  on payments for update using (true);

create policy "Users can delete their own payments"
  on payments for delete using (true);

-- Assets policies
create policy "Users can view their own and team assets"
  on assets for select using (true);

create policy "Users can insert assets"
  on assets for insert with check (true);

create policy "Users can delete their own assets"
  on assets for delete using (true);

-- Recurring payments policies (service role bypasses; mirror payments)
create policy "Members can view recurring payments"
  on recurring_payments for select using (true);
create policy "Users can insert recurring payments"
  on recurring_payments for insert with check (true);
create policy "Users can update recurring payments"
  on recurring_payments for update using (true);
create policy "Users can delete recurring payments"
  on recurring_payments for delete using (true);

create policy "Members can view recurring entries"
  on recurring_entries for select using (true);
create policy "Users can insert recurring entries"
  on recurring_entries for insert with check (true);
create policy "Users can update recurring entries"
  on recurring_entries for update using (true);
create policy "Users can delete recurring entries"
  on recurring_entries for delete using (true);

-- Payment overrides policies (service role bypasses; mirror payments)
drop policy if exists "Members can view payment overrides" on payment_overrides;
drop policy if exists "Users can insert payment overrides" on payment_overrides;
drop policy if exists "Users can update payment overrides" on payment_overrides;
drop policy if exists "Users can delete payment overrides" on payment_overrides;
create policy "Members can view payment overrides" on payment_overrides for select using (true);
create policy "Users can insert payment overrides" on payment_overrides for insert with check (true);
create policy "Users can update payment overrides" on payment_overrides for update using (true);
create policy "Users can delete payment overrides" on payment_overrides for delete using (true);

-- Mobile push notification device tokens
create table if not exists devices (
  id uuid default gen_random_uuid() primary key,
  user_id uuid not null references users(id) on delete cascade,
  expo_push_token text unique not null,
  platform text not null default 'android',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table devices enable row level security;

-- Devices policies (service role bypasses; mirror other tables)
drop policy if exists "Users can view devices" on devices;
drop policy if exists "Users can insert devices" on devices;
drop policy if exists "Users can update devices" on devices;
drop policy if exists "Users can delete devices" on devices;
create policy "Users can view devices" on devices for select using (true);
create policy "Users can insert devices" on devices for insert with check (true);
create policy "Users can update devices" on devices for update using (true);
create policy "Users can delete devices" on devices for delete using (true);

-- Shared event expense splitting. RLS on with no policies: only the server's
-- service-role client may touch these tables, never the public anon key.
create table if not exists events (
  id uuid default gen_random_uuid() primary key,
  name text not null check (length(trim(name)) > 0),
  event_date date,
  created_by uuid not null references users(id) on delete cascade,
  status text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz default now()
);

create table if not exists event_participants (
  id uuid default gen_random_uuid() primary key,
  event_id uuid not null references events(id) on delete cascade,
  user_id uuid references users(id) on delete cascade,
  display_name text,
  created_at timestamptz default now(),
  check ((user_id is null) <> (display_name is null)),
  check (display_name is null or length(trim(display_name)) > 0)
);
create unique index if not exists event_participants_event_user
  on event_participants (event_id, user_id) where user_id is not null;

create table if not exists event_expenses (
  id uuid default gen_random_uuid() primary key,
  event_id uuid not null references events(id) on delete cascade,
  description text not null check (length(trim(description)) > 0),
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null check (currency in ('TRY', 'USD', 'EUR', 'GBP')),
  paid_by uuid not null references event_participants(id) deferrable initially deferred,
  spent_on date not null default current_date,
  created_by uuid not null references users(id),
  created_at timestamptz default now()
);

create table if not exists event_expense_shares (
  expense_id uuid not null references event_expenses(id) on delete cascade,
  participant_id uuid not null references event_participants(id) deferrable initially deferred,
  amount_minor bigint not null check (amount_minor >= 0),
  primary key (expense_id, participant_id)
);

create table if not exists event_settlements (
  id uuid default gen_random_uuid() primary key,
  event_id uuid not null references events(id) on delete cascade,
  from_participant uuid not null references event_participants(id) deferrable initially deferred,
  to_participant uuid not null references event_participants(id) deferrable initially deferred,
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null check (currency in ('TRY', 'USD', 'EUR', 'GBP')),
  created_by uuid not null references users(id),
  created_at timestamptz default now(),
  check (from_participant <> to_participant)
);

alter table events enable row level security;
alter table event_participants enable row level security;
alter table event_expenses enable row level security;
alter table event_expense_shares enable row level security;
alter table event_settlements enable row level security;

-- Atomic expense writes: the expense row and its shares change in one transaction.
-- Service role only; the route validates the payer and shares against the event.
create or replace function event_expense_insert(
  p_event_id uuid,
  p_created_by uuid,
  p_description text,
  p_amount_minor bigint,
  p_currency text,
  p_paid_by uuid,
  p_spent_on date,
  p_shares jsonb
) returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into event_expenses (event_id, created_by, description, amount_minor, currency, paid_by, spent_on)
  values (p_event_id, p_created_by, p_description, p_amount_minor, p_currency, p_paid_by, p_spent_on)
  returning id into v_id;
  insert into event_expense_shares (participant_id, amount_minor, expense_id)
  select s.participant_id, s.amount_minor, v_id
  from jsonb_to_recordset(p_shares) as s(participant_id uuid, amount_minor bigint);
  return v_id;
end;
$$;

create or replace function event_expense_replace(
  p_expense_id uuid,
  p_description text,
  p_amount_minor bigint,
  p_currency text,
  p_paid_by uuid,
  p_spent_on date,
  p_shares jsonb
) returns void
language plpgsql
set search_path = public
as $$
begin
  update event_expenses
  set description = p_description,
      amount_minor = p_amount_minor,
      currency = p_currency,
      paid_by = p_paid_by,
      spent_on = p_spent_on
  where id = p_expense_id;
  if not found then
    raise exception 'Expense % not found', p_expense_id using errcode = 'P0002';
  end if;
  delete from event_expense_shares where expense_id = p_expense_id;
  insert into event_expense_shares (participant_id, amount_minor, expense_id)
  select s.participant_id, s.amount_minor, p_expense_id
  from jsonb_to_recordset(p_shares) as s(participant_id uuid, amount_minor bigint);
end;
$$;

revoke all on function event_expense_insert(uuid, uuid, text, bigint, text, uuid, date, jsonb) from public, anon, authenticated;
revoke all on function event_expense_replace(uuid, text, bigint, text, uuid, date, jsonb) from public, anon, authenticated;
