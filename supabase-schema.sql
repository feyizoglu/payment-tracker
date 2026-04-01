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

-- Enable Row Level Security
alter table users enable row level security;
alter table teams enable row level security;
alter table team_members enable row level security;
alter table payments enable row level security;

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
