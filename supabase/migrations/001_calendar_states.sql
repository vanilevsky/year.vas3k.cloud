-- Create calendar_states table for cloud sync
create table calendar_states (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  year       int  not null,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),

  constraint calendar_states_user_year_unique unique (user_id, year)
);

-- Enable Row-Level Security
alter table calendar_states enable row level security;

-- Policy: users can select, insert, update, delete only their own rows
create policy "Users can manage their own calendar states"
  on calendar_states
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
