# GAP

Aprovecha tus huecos de tiempo. GAP te recomienda qué hacer según los minutos que tienes y te deja **avanzar en tareas largas sin terminarlas en una sola sesión**.

## Funcionalidades
- **Tareas rápidas, largas y por hitos.**
- **Progreso real**: manual o calculado por hitos completados. Nunca se deduce solo del tiempo invertido.
- **Smart Gap Matching**: con X minutos libres, separa lo que puedes *completar*, lo que puedes *avanzar* y lo que *no es adecuado* ahora.
- **Sesiones de trabajo** con objetivo, temporizador opcional, pausa y tiempo acumulado entre sesiones.
- **Estadísticas** que distinguen tiempo invertido, progreso, tareas terminadas y en progreso.

## Empezar
```bash
npm install
npm run dev      # desarrollo
npm test         # tests (Vitest)
npm run build    # producción
```
Sin configuración, GAP funciona en modo local (datos en el navegador). Para usar cuentas y sincronización:

1. Crea un proyecto en Supabase y aplica en orden `supabase/migrations/0001_gap_base.sql` y `0002_smart_progress.sql`.
2. Copia `.env.example` a `.env` y rellena `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.

## Estructura
- `src/lib/` lógica pura: `progress`, `matching`, `sessions`, `stats`
- `src/data/` repositorios local y Supabase
- `src/components/` interfaz
- `supabase/migrations/` migraciones aditivas con RLS
- `supabase/rollback/` reversión **destructiva**, solo manual

Detalles, verificación y limitaciones conocidas en [INFORME.md](INFORME.md).
