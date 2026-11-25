-- GAP · Migración 0002: Smart Progress.
-- Compatibilidad: solo AÑADE columnas con valor por defecto y tablas nuevas.
-- No elimina, renombra ni sobrescribe datos existentes (estimated_minutes se conserva).
-- Revertir (manual, destructivo, solo con autorización): ver supabase/rollback/0002_rollback.sql

-- 1) Nuevas columnas en tasks -------------------------------------------------
alter table public.tasks
  add column if not exists task_type text not null default 'quick',
  add column if not exists estimated_total_minutes integer,
  add column if not exists actual_minutes_spent integer not null default 0,
  add column if not exists progress_percentage integer not null default 0,
  add column if not exists progress_tracking_mode text not null default 'manual';

alter table public.tasks drop constraint if exists tasks_task_type_chk;
alter table public.tasks add constraint tasks_task_type_chk
  check (task_type in ('quick', 'long', 'milestones'));

alter table public.tasks drop constraint if exists tasks_progress_mode_chk;
alter table public.tasks add constraint tasks_progress_mode_chk
  check (progress_tracking_mode in ('manual', 'milestones'));

alter table public.tasks drop constraint if exists tasks_progress_range_chk;
alter table public.tasks add constraint tasks_progress_range_chk
  check (progress_percentage between 0 and 100);

alter table public.tasks drop constraint if exists tasks_actual_minutes_chk;
alter table public.tasks add constraint tasks_actual_minutes_chk
  check (actual_minutes_spent >= 0);

alter table public.tasks drop constraint if exists tasks_estimated_total_chk;
alter table public.tasks add constraint tasks_estimated_total_chk
  check (estimated_total_minutes is null or estimated_total_minutes between 1 and 100000);

-- 2) Relleno SOLO de las columnas nuevas, sin tocar las antiguas --------------
update public.tasks
   set estimated_total_minutes = estimated_minutes
 where estimated_total_minutes is null and estimated_minutes is not null;

update public.tasks
   set progress_percentage = 100
 where completed = true and progress_percentage = 0;

-- 3) Hitos --------------------------------------------------------------------
create table if not exists public.milestones (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  done boolean not null default false,
  position integer not null default 0 check (position >= 0),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists milestones_task_idx on public.milestones (task_id, position);

-- 4) Sesiones de trabajo ------------------------------------------------------
create table if not exists public.work_sessions (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  goal text not null default '' check (char_length(goal) <= 300),
  started_at timestamptz not null default now(),
  minutes_spent integer not null check (minutes_spent between 0 and 1440),
  progress_before integer not null check (progress_before between 0 and 100),
  progress_after integer not null check (progress_after between 0 and 100),
  created_at timestamptz not null default now()
);
create index if not exists work_sessions_task_idx on public.work_sessions (task_id, started_at desc);
create index if not exists work_sessions_user_idx on public.work_sessions (user_id, started_at desc);

-- 5) RLS ----------------------------------------------------------------------
alter table public.milestones enable row level security;
alter table public.work_sessions enable row level security;

drop policy if exists milestones_select_own on public.milestones;
drop policy if exists milestones_insert_own on public.milestones;
drop policy if exists milestones_update_own on public.milestones;
drop policy if exists milestones_delete_own on public.milestones;

create policy milestones_select_own on public.milestones
  for select to authenticated using (user_id = (select auth.uid()));
-- El hito solo puede colgar de una tarea del mismo usuario.
create policy milestones_insert_own on public.milestones
  for insert to authenticated with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.tasks t where t.id = task_id and t.user_id = (select auth.uid()))
  );
create policy milestones_update_own on public.milestones
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.tasks t where t.id = task_id and t.user_id = (select auth.uid()))
  );
create policy milestones_delete_own on public.milestones
  for delete to authenticated using (user_id = (select auth.uid()));

drop policy if exists work_sessions_select_own on public.work_sessions;
drop policy if exists work_sessions_insert_own on public.work_sessions;
drop policy if exists work_sessions_delete_own on public.work_sessions;

create policy work_sessions_select_own on public.work_sessions
  for select to authenticated using (user_id = (select auth.uid()));
create policy work_sessions_insert_own on public.work_sessions
  for insert to authenticated with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.tasks t where t.id = task_id and t.user_id = (select auth.uid()))
  );
create policy work_sessions_delete_own on public.work_sessions
  for delete to authenticated using (user_id = (select auth.uid()));
-- Las sesiones son un registro histórico: no hay política de UPDATE.

-- 6) Cierre atómico de sesión -------------------------------------------------
-- SECURITY INVOKER: respeta RLS. Valida entradas, acumula tiempo y aplica el
-- progreso con tope 100. En modo 'milestones' el progreso sale de los hitos.
create or replace function public.finish_work_session(
  p_task_id uuid,
  p_goal text,
  p_started_at timestamptz,
  p_minutes integer,
  p_new_progress integer default null
) returns public.tasks
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_task public.tasks;
  v_before integer;
  v_after integer;
  v_total integer;
  v_done integer;
begin
  if p_minutes is null or p_minutes < 0 or p_minutes > 1440 then
    raise exception 'invalid minutes' using errcode = '22023';
  end if;
  if p_new_progress is not null and (p_new_progress < 0 or p_new_progress > 100) then
    raise exception 'invalid progress' using errcode = '22023';
  end if;

  select * into v_task from public.tasks where id = p_task_id for update;
  if not found then
    raise exception 'task not found' using errcode = 'P0002';
  end if;

  v_before := v_task.progress_percentage;
  v_after := v_before;

  if v_task.progress_tracking_mode = 'milestones' then
    select count(*), count(*) filter (where done) into v_total, v_done
      from public.milestones where task_id = p_task_id;
    if v_total > 0 then
      v_after := least(100, round(100.0 * v_done / v_total));
    end if;
  elsif p_new_progress is not null then
    v_after := least(100, greatest(0, p_new_progress));
  end if;

  insert into public.work_sessions (task_id, goal, started_at, minutes_spent, progress_before, progress_after)
  values (p_task_id, coalesce(p_goal, ''), coalesce(p_started_at, now()), p_minutes, v_before, v_after);

  update public.tasks
     set actual_minutes_spent = actual_minutes_spent + p_minutes,
         progress_percentage = v_after,
         completed = (v_after >= 100),
         completed_at = case when v_after >= 100 then coalesce(completed_at, now()) else null end
   where id = p_task_id
   returning * into v_task;

  return v_task;
end;
$$;

revoke all on function public.finish_work_session(uuid, text, timestamptz, integer, integer) from public, anon;
grant execute on function public.finish_work_session(uuid, text, timestamptz, integer, integer) to authenticated;
