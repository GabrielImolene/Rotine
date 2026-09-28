-- Moletas: notas persistentes para captura rápida.
-- Execute este arquivo após as migrations anteriores em projetos já existentes.

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 180),
  content text not null default '' check (char_length(content) <= 10000),
  is_pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists notes_user_pinned_updated_idx on public.notes(user_id, is_pinned desc, updated_at desc);

drop trigger if exists touch_notes on public.notes;
create trigger touch_notes before update on public.notes for each row execute procedure public.touch_updated_at();

alter table public.notes enable row level security;
drop policy if exists "note owner" on public.notes;
create policy "note owner" on public.notes for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

revoke all on public.notes from anon;
revoke all on public.notes from authenticated;
grant select, insert, update, delete on public.notes to authenticated;
