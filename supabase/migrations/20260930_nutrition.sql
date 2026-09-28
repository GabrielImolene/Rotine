-- Planejamento alimentar e hidratação por usuário.
-- Execute depois de 20260929_study_files_and_mfa.sql.

alter table public.profiles
  add column if not exists daily_water_goal_ml integer not null default 2000
  check (daily_water_goal_ml between 250 and 10000);

create table if not exists public.meal_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  meal_date date not null,
  meal_type text not null check (meal_type in ('Café da manhã', 'Almoço', 'Lanche', 'Jantar')),
  title text not null check (char_length(title) between 1 and 180),
  planned_time time,
  notes text not null default '' check (char_length(notes) <= 2000),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists meal_entries_user_date_idx
  on public.meal_entries(user_id, meal_date, planned_time);

create table if not exists public.hydration_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  entry_date date not null,
  amount_ml integer not null default 0 check (amount_ml between 0 and 20000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, entry_date)
);

drop trigger if exists touch_meal_entries on public.meal_entries;
drop trigger if exists touch_hydration_logs on public.hydration_logs;
create trigger touch_meal_entries
  before update on public.meal_entries
  for each row execute procedure public.touch_updated_at();
create trigger touch_hydration_logs
  before update on public.hydration_logs
  for each row execute procedure public.touch_updated_at();

alter table public.meal_entries enable row level security;
alter table public.hydration_logs enable row level security;

drop policy if exists "meal owner" on public.meal_entries;
drop policy if exists "hydration owner" on public.hydration_logs;
drop policy if exists "mfa required meal access" on public.meal_entries;
drop policy if exists "mfa required hydration access" on public.hydration_logs;
create policy "meal owner" on public.meal_entries for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
create policy "hydration owner" on public.hydration_logs for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- A função e as políticas de MFA foram criadas na migration anterior.
create policy "mfa required meal access" on public.meal_entries as restrictive for all
  using (not public.mfa_is_required(user_id) or (auth.jwt() ->> 'aal') = 'aal2')
  with check (not public.mfa_is_required(user_id) or (auth.jwt() ->> 'aal') = 'aal2');
create policy "mfa required hydration access" on public.hydration_logs as restrictive for all
  using (not public.mfa_is_required(user_id) or (auth.jwt() ->> 'aal') = 'aal2')
  with check (not public.mfa_is_required(user_id) or (auth.jwt() ->> 'aal') = 'aal2');

revoke all on public.meal_entries, public.hydration_logs from anon;
revoke all on public.meal_entries, public.hydration_logs from authenticated;
grant select, insert, update, delete on public.meal_entries, public.hydration_logs to authenticated;
