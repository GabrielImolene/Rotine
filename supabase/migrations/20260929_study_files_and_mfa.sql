-- Materiais privados de estudo e proteção opcional por MFA para a Moletas.
-- Execute após as migrations anteriores.

alter table public.profiles
  add column if not exists mfa_required boolean not null default false;

create table if not exists public.study_attachments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  subject_id uuid not null references public.study_subjects(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 180),
  type text not null check (type in ('link', 'imagem', 'certificado', 'arquivo')),
  url text check (char_length(url) <= 2048),
  storage_path text check (char_length(storage_path) <= 1024),
  mime_type text check (char_length(mime_type) <= 120),
  size_bytes bigint check (size_bytes is null or size_bytes between 1 and 10485760),
  created_at timestamptz not null default now(),
  check (
    (url is not null and storage_path is null)
    or (url is null and storage_path is not null)
  )
);
create index if not exists study_attachments_subject_idx
  on public.study_attachments(subject_id, created_at);

alter table public.study_attachments enable row level security;
drop policy if exists "study attachment owner" on public.study_attachments;
create policy "study attachment owner" on public.study_attachments for all
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.study_subjects subject
      where subject.id = subject_id and subject.user_id = auth.uid()
    )
  );

-- Os objetos nunca são públicos: cada arquivo fica no diretório UUID do dono.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'study-files',
  'study-files',
  false,
  10485760,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "study files read by owner" on storage.objects;
drop policy if exists "study files upload by owner" on storage.objects;
drop policy if exists "study files delete by owner" on storage.objects;
create policy "study files read by owner" on storage.objects for select to authenticated
  using (
    bucket_id = 'study-files'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );
create policy "study files upload by owner" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'study-files'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );
create policy "study files delete by owner" on storage.objects for delete to authenticated
  using (
    bucket_id = 'study-files'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

-- Uma conta que ativou MFA só lê ou altera dados privados com JWT AAL2.
create or replace function public.mfa_is_required(target_user uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select coalesce(
    (select profile.mfa_required from public.profiles profile where profile.id = target_user),
    false
  );
$$;
revoke all on function public.mfa_is_required(uuid) from public;
grant execute on function public.mfa_is_required(uuid) to authenticated;

drop policy if exists "mfa required on profile update" on public.profiles;
create policy "mfa required on profile update" on public.profiles as restrictive for update to authenticated
  using (not mfa_required or (auth.jwt() ->> 'aal') = 'aal2')
  with check (not mfa_required or (auth.jwt() ->> 'aal') = 'aal2');

drop policy if exists "mfa required event access" on public.calendar_events;
drop policy if exists "mfa required task access" on public.tasks;
drop policy if exists "mfa required note access" on public.notes;
drop policy if exists "mfa required subject access" on public.study_subjects;
drop policy if exists "mfa required path access" on public.study_paths;
drop policy if exists "mfa required topic access" on public.study_topics;
drop policy if exists "mfa required session access" on public.study_sessions;
drop policy if exists "mfa required attachment access" on public.study_attachments;
drop policy if exists "mfa required habit access" on public.habits;
drop policy if exists "mfa required workout access" on public.workouts;
drop policy if exists "mfa required workout session access" on public.workout_sessions;
drop policy if exists "mfa required notification access" on public.notification_logs;

create policy "mfa required event access" on public.calendar_events as restrictive for all
  using (not public.mfa_is_required(user_id) or (auth.jwt() ->> 'aal') = 'aal2')
  with check (not public.mfa_is_required(user_id) or (auth.jwt() ->> 'aal') = 'aal2');
create policy "mfa required task access" on public.tasks as restrictive for all
  using (not public.mfa_is_required(user_id) or (auth.jwt() ->> 'aal') = 'aal2')
  with check (not public.mfa_is_required(user_id) or (auth.jwt() ->> 'aal') = 'aal2');
create policy "mfa required note access" on public.notes as restrictive for all
  using (not public.mfa_is_required(user_id) or (auth.jwt() ->> 'aal') = 'aal2')
  with check (not public.mfa_is_required(user_id) or (auth.jwt() ->> 'aal') = 'aal2');
create policy "mfa required subject access" on public.study_subjects as restrictive for all
  using (not public.mfa_is_required(user_id) or (auth.jwt() ->> 'aal') = 'aal2')
  with check (not public.mfa_is_required(user_id) or (auth.jwt() ->> 'aal') = 'aal2');
create policy "mfa required path access" on public.study_paths as restrictive for all
  using (not public.mfa_is_required(user_id) or (auth.jwt() ->> 'aal') = 'aal2')
  with check (not public.mfa_is_required(user_id) or (auth.jwt() ->> 'aal') = 'aal2');
create policy "mfa required topic access" on public.study_topics as restrictive for all
  using (not public.mfa_is_required(user_id) or (auth.jwt() ->> 'aal') = 'aal2')
  with check (not public.mfa_is_required(user_id) or (auth.jwt() ->> 'aal') = 'aal2');
create policy "mfa required session access" on public.study_sessions as restrictive for all
  using (not public.mfa_is_required(user_id) or (auth.jwt() ->> 'aal') = 'aal2')
  with check (not public.mfa_is_required(user_id) or (auth.jwt() ->> 'aal') = 'aal2');
create policy "mfa required attachment access" on public.study_attachments as restrictive for all
  using (not public.mfa_is_required(user_id) or (auth.jwt() ->> 'aal') = 'aal2')
  with check (not public.mfa_is_required(user_id) or (auth.jwt() ->> 'aal') = 'aal2');
create policy "mfa required habit access" on public.habits as restrictive for all
  using (not public.mfa_is_required(user_id) or (auth.jwt() ->> 'aal') = 'aal2')
  with check (not public.mfa_is_required(user_id) or (auth.jwt() ->> 'aal') = 'aal2');
create policy "mfa required workout access" on public.workouts as restrictive for all
  using (not public.mfa_is_required(user_id) or (auth.jwt() ->> 'aal') = 'aal2')
  with check (not public.mfa_is_required(user_id) or (auth.jwt() ->> 'aal') = 'aal2');
create policy "mfa required workout session access" on public.workout_sessions as restrictive for all
  using (not public.mfa_is_required(user_id) or (auth.jwt() ->> 'aal') = 'aal2')
  with check (not public.mfa_is_required(user_id) or (auth.jwt() ->> 'aal') = 'aal2');
create policy "mfa required notification access" on public.notification_logs as restrictive for select
  using (not public.mfa_is_required(user_id) or (auth.jwt() ->> 'aal') = 'aal2');

drop policy if exists "mfa required study file access" on storage.objects;
create policy "mfa required study file access" on storage.objects as restrictive for all to authenticated
  using (
    bucket_id <> 'study-files'
    or not public.mfa_is_required(auth.uid())
    or (auth.jwt() ->> 'aal') = 'aal2'
  )
  with check (
    bucket_id <> 'study-files'
    or not public.mfa_is_required(auth.uid())
    or (auth.jwt() ->> 'aal') = 'aal2'
  );

revoke all on public.study_attachments from anon;
revoke all on public.study_attachments from authenticated;
grant select, insert, update, delete on public.study_attachments to authenticated;
