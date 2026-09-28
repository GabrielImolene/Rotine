-- Moletas: cronômetros persistentes para tarefas com duração.
-- Execute este arquivo após a migration inicial caso seu projeto já exista.

alter table public.tasks
  add column if not exists duration_minutes integer check (duration_minutes between 1 and 480);

alter table public.tasks
  add column if not exists timer_started_at timestamptz;

alter table public.tasks
  add column if not exists timer_elapsed_seconds integer not null default 0 check (timer_elapsed_seconds >= 0);
