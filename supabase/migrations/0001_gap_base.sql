-- GAP · Migración 0001: base de tareas.
-- Aditiva y no destructiva (solo crea objetos si no existen).

create extension if not exists pgcrypto;

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  estimated_minutes integer check (estimated_minutes is null or estimated_minutes between 1 and 100000),
  completed boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists tasks_user_idx on public.tasks (user_id, created_at desc);

alter table public.tasks enable row level security;

drop policy if exists tasks_select_own on public.tasks;
drop policy if exists tasks_insert_own on public.tasks;
drop policy if exists tasks_update_own on public.tasks;
drop policy if exists tasks_delete_own on public.tasks;

create policy tasks_select_own on public.tasks
  for select to authenticated using (user_id = (select auth.uid()));
create policy tasks_insert_own on public.tasks
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy tasks_update_own on public.tasks
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy tasks_delete_own on public.tasks
  for delete to authenticated using (user_id = (select auth.uid()));
