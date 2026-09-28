-- Moletas: trilhas contínuas de estudo e agrupamento de treinos.
-- Execute este arquivo após as migrations anteriores em projetos já existentes.

alter table public.workouts
  add column if not exists body_part text check (char_length(body_part) between 1 and 100);

create table if not exists public.study_paths (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  subject_id uuid references public.study_subjects(id) on delete set null,
  title text not null check (char_length(title) between 1 and 160),
  description text not null default '' check (char_length(description) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists study_paths_user_idx on public.study_paths(user_id, created_at);

create table if not exists public.study_topics (
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
create index if not exists study_topics_path_position_idx on public.study_topics(path_id, position, created_at);

drop trigger if exists touch_study_paths on public.study_paths;
create trigger touch_study_paths before update on public.study_paths for each row execute procedure public.touch_updated_at();

alter table public.study_paths enable row level security;
alter table public.study_topics enable row level security;

drop policy if exists "study path owner" on public.study_paths;
create policy "study path owner" on public.study_paths for all using (auth.uid() = user_id) with check (
  auth.uid() = user_id and (
    subject_id is null or exists (
      select 1 from public.study_subjects subject
      where subject.id = subject_id and subject.user_id = auth.uid()
    )
  )
);

drop policy if exists "study topic owner" on public.study_topics;
create policy "study topic owner" on public.study_topics for all using (auth.uid() = user_id) with check (
  auth.uid() = user_id and exists (
    select 1 from public.study_paths path
    where path.id = path_id and path.user_id = auth.uid()
  )
);

revoke all on public.study_paths, public.study_topics from anon;
revoke all on public.study_paths, public.study_topics from authenticated;
grant select, insert, update, delete on public.study_paths, public.study_topics to authenticated;
