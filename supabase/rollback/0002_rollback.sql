-- ATENCIÓN: DESTRUCTIVO. Borra el progreso, hitos y sesiones guardados.
-- No ejecutar sin autorización explícita y sin copia de seguridad.
drop function if exists public.finish_work_session(uuid, text, timestamptz, integer, integer);
drop table if exists public.work_sessions;
drop table if exists public.milestones;
alter table public.tasks
  drop column if exists task_type,
  drop column if exists estimated_total_minutes,
  drop column if exists actual_minutes_spent,
  drop column if exists progress_percentage,
  drop column if exists progress_tracking_mode;
