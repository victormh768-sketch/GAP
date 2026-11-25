# GAP · Informe de implementación (Smart Progress)

## Contexto
No existía ningún proyecto GAP previo (ni en GitHub, Vercel ni Supabase), así que se creó desde cero con Smart Progress integrado. Por eso no hay datos existentes que migrar en producción, pero **las migraciones están diseñadas y probadas para ser compatibles con tareas anteriores**.

Stack: React 19 + TypeScript + Vite + Tailwind 4 + Supabase (opcional) + Vitest.

## Archivos
| Área | Archivos |
|---|---|
| Migraciones | `supabase/migrations/0001_gap_base.sql`, `0002_smart_progress.sql`, `supabase/rollback/0002_rollback.sql` (destructivo, solo manual) |
| Lógica pura | `src/lib/progress.ts`, `sessions.ts`, `matching.ts`, `stats.ts` |
| Datos | `src/data/repository.ts` (local + saneado de datos antiguos), `src/data/supabase.ts` |
| UI | `src/App.tsx`, `src/components/{TaskForm,TaskCard,ProgressBar,SessionPanel,GapMatcher,StatsView,Auth}.tsx`, `src/hooks/useGap.ts` |
| Tests | `src/lib/smartProgress.test.ts` (32 tests) |

## Base de datos
- `tasks`: 0001 crea la base; 0002 **solo añade** `task_type`, `estimated_total_minutes`, `actual_minutes_spent`, `progress_percentage`, `progress_tracking_mode` con valores por defecto. `estimated_minutes` se conserva y se copia a la columna nueva sin borrarla.
- Tablas nuevas: `milestones`, `work_sessions` (histórico, sin UPDATE).
- CHECK: porcentaje 0–100, minutos ≥ 0, tipos/modos válidos, estimación 1–100000.
- RLS en las tres tablas; hitos y sesiones solo pueden colgar de tareas del propio usuario.
- `finish_work_session(...)`: `SECURITY INVOKER` (respeta RLS), atómica; valida entradas, acumula tiempo, aplica el progreso con tope 100 y, en modo hitos, lo calcula desde los hitos.

## Reglas de negocio
- El progreso **nunca** se deriva del tiempo invertido: es manual o por hitos.
- Matching: *completar* (restante ≤ hueco), *avanzar* (larga/hitos con hueco ≥ 10 min), *no adecuada*. Las completadas se excluyen.
- Estadísticas separadas: tiempo invertido, progreso ganado (puntos), terminadas, en progreso.

## Verificación realizada
- 32 tests unitarios: manual, hitos, persistencia, acumulación entre sesiones, recomendaciones, exclusión de completadas, tope 100%, compatibilidad con datos antiguos.
- `tsc` y `vite build` sin errores.
- Flujo en navegador (móvil): crear tareas, hueco de 20 min, sesión con temporizador, guardar, recargar → el progreso persiste. Sin errores de consola.
- Migraciones sobre **PostgreSQL 16 real** con datos previos: aplicadas dos veces (idempotentes), datos antiguos intactos, RLS entre dos usuarios, `anon` bloqueado, rechazo de progreso 250 / minutos negativos / suplantación de `user_id`.

## Posibles problemas y pendientes
1. **Las migraciones NO están aplicadas** en ningún Supabase. Tus proyectos actuales son CHAIN y Domino Planner; GAP debería tener el suyo. Hay que crearlo (puede tener coste) y aplicar 0001 → 0002.
2. La prueba de BD usó un `auth.uid()` simulado, no Supabase real: conviene repetir una prueba de humo tras aplicarlas.
3. Modo sin cuenta: datos solo en `localStorage` de ese dispositivo; no se sincronizan ni migran a la nube al iniciar sesión.
4. Sesiones de menos de 30 s se guardan como 0 min (el tiempo se redondea a minutos).
5. La sesión activa se guarda en `localStorage` y se restaura al recargar, pero el temporizador no sigue contando con la pestaña cerrada de forma fiable en móviles en segundo plano (se recalcula por marca de tiempo, por lo que el tiempo sí se recupera al volver).
6. Sin tests automáticos de interfaz ni de BD en CI: la comprobación de UI y SQL fue manual.
7. Sin confirmación de correo configurada en Auth; se asume la de Supabase por defecto.
8. Un aviso de linter (`set-state-in-effect` en `useGap.ts`) es un falso positivo.
