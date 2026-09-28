-- Moletas: estrutura multiusuário. Rode este arquivo uma única vez no SQL Editor do Supabase.
-- As tabelas usam RLS; o navegador só acessa registros cujo user_id é o usuário autenticado.

create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text not null default 'Minha conta' check (char_length(display_name) between 1 and 80),
  email_notifications boolean not null default false,
  sms_notifications boolean not null default false,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 180),
  starts_at timestamptz not null,
  category text not null default 'Pessoal' check (category in ('Pessoal','Trabalho','Estudos','Saúde')),
  reminder_minutes integer not null default 15 check (reminder_minutes between 0 and 10080),
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index calendar_events_user_starts_idx on public.calendar_events(user_id, starts_at);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 180),
  due_date date,
  category text not null default 'Pessoal' check (category in ('Pessoal','Trabalho','Estudos','Casa')),
  is_priority boolean not null default false,
  duration_minutes integer check (duration_minutes between 1 and 480),
  timer_started_at timestamptz,
  timer_elapsed_seconds integer not null default 0 check (timer_elapsed_seconds >= 0),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index tasks_user_due_idx on public.tasks(user_id, due_date);

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 180),
  content text not null default '' check (char_length(content) <= 10000),
  is_pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index notes_user_pinned_updated_idx on public.notes(user_id, is_pinned desc, updated_at desc);

create table public.study_subjects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  color text not null default '#6d5dfc' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  weekly_target_minutes integer not null default 180 check (weekly_target_minutes between 15 and 10080),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.study_paths (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  subject_id uuid references public.study_subjects(id) on delete set null,
  title text not null check (char_length(title) between 1 and 160),
  description text not null default '' check (char_length(description) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index study_paths_user_idx on public.study_paths(user_id, created_at);

create table public.study_topics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  path_id uuid not null references public.study_paths(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 180),
  resource_url text check (char_length(resource_url) <= 2048),
  notes text not null default '' check (char_length(notes) <= 4000),
  position integer not null default 1 check (position between 1 and 9999),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
create index study_topics_path_position_idx on public.study_topics(path_id, position, created_at);

create table public.study_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  subject_id uuid not null references public.study_subjects(id) on delete cascade,
  started_at timestamptz not null default now(),
  minutes integer not null check (minutes between 1 and 1440),
  notes text not null default '',
  created_at timestamptz not null default now()
);
create index study_sessions_user_started_idx on public.study_sessions(user_id, started_at desc);

create table public.habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  frequency jsonb not null default '[]'::jsonb,
  target integer not null default 1 check (target between 1 and 99),
  completed_dates jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (jsonb_typeof(frequency) = 'array' and jsonb_typeof(completed_dates) = 'array')
);

create table public.workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  focus text not null default 'Corpo inteiro' check (char_length(focus) between 1 and 100),
  body_part text check (char_length(body_part) between 1 and 100),
  duration_minutes integer not null check (duration_minutes between 5 and 360),
  days jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (jsonb_typeof(days) = 'array')
);

create table public.workout_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  workout_id uuid not null references public.workouts(id) on delete cascade,
  completed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index workout_sessions_user_completed_idx on public.workout_sessions(user_id, completed_at desc);

-- Reserva idempotente para que cron retries não causem mensagens duplicadas.
create table public.notification_logs (
  id bigint generated always as identity primary key,
  event_id uuid not null references public.calendar_events(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  channel text not null check (channel in ('email','sms')),
  scheduled_for timestamptz not null,
  sent_at timestamptz not null default now(),
  unique(event_id, channel, scheduled_for)
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'name', split_part(coalesce(new.email, 'Minha conta'), '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger touch_profiles before update on public.profiles for each row execute procedure public.touch_updated_at();
create trigger touch_calendar_events before update on public.calendar_events for each row execute procedure public.touch_updated_at();
create trigger touch_tasks before update on public.tasks for each row execute procedure public.touch_updated_at();
create trigger touch_notes before update on public.notes for each row execute procedure public.touch_updated_at();
create trigger touch_subjects before update on public.study_subjects for each row execute procedure public.touch_updated_at();
create trigger touch_study_paths before update on public.study_paths for each row execute procedure public.touch_updated_at();
create trigger touch_habits before update on public.habits for each row execute procedure public.touch_updated_at();
create trigger touch_workouts before update on public.workouts for each row execute procedure public.touch_updated_at();

alter table public.profiles enable row level security;
alter table public.calendar_events enable row level security;
alter table public.tasks enable row level security;
alter table public.notes enable row level security;
alter table public.study_subjects enable row level security;
alter table public.study_paths enable row level security;
alter table public.study_topics enable row level security;
alter table public.study_sessions enable row level security;
alter table public.habits enable row level security;
alter table public.workouts enable row level security;
alter table public.workout_sessions enable row level security;
alter table public.notification_logs enable row level security;

create policy "profile owner" on public.profiles for all using (auth.uid() = id) with check (auth.uid() = id);
create policy "event owner" on public.calendar_events for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "task owner" on public.tasks for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "note owner" on public.notes for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "subject owner" on public.study_subjects for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "study path owner" on public.study_paths for all using (auth.uid() = user_id) with check (
  auth.uid() = user_id and (
    subject_id is null or exists (
      select 1 from public.study_subjects subject
      where subject.id = subject_id and subject.user_id = auth.uid()
    )
  )
);
create policy "study topic owner" on public.study_topics for all using (auth.uid() = user_id) with check (
  auth.uid() = user_id and exists (
    select 1 from public.study_paths path
    where path.id = path_id and path.user_id = auth.uid()
  )
);
create policy "study session owner" on public.study_sessions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "habit owner" on public.habits for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "workout owner" on public.workouts for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "workout session owner" on public.workout_sessions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "owner can read notification history" on public.notification_logs for select using (auth.uid() = user_id);

-- Defesa em profundidade: visitantes anônimos não recebem qualquer privilégio.
revoke all on public.profiles, public.calendar_events, public.tasks, public.study_subjects,
  public.notes, public.study_paths, public.study_topics, public.study_sessions, public.habits, public.workouts, public.workout_sessions,
  public.notification_logs from anon;
revoke all on public.profiles, public.calendar_events, public.tasks, public.study_subjects,
  public.notes, public.study_paths, public.study_topics, public.study_sessions, public.habits, public.workouts, public.workout_sessions,
  public.notification_logs from authenticated;
grant select, insert, update, delete on public.profiles, public.calendar_events, public.tasks,
  public.notes, public.study_subjects, public.study_paths, public.study_topics, public.study_sessions, public.habits, public.workouts,
  public.workout_sessions to authenticated;
grant select on public.notification_logs to authenticated;
