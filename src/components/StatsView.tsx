import { useMemo, useState } from 'react'
import { computeStats, formatMinutes } from '../lib/stats'
import type { Task, WorkSession } from '../types'

const RANGES = [
  { id: 'today', label: 'Hoy' },
  { id: 'week', label: '7 días' },
  { id: 'all', label: 'Todo' },
] as const

function since(id: (typeof RANGES)[number]['id']): string | undefined {
  const d = new Date()
  if (id === 'all') return undefined
  if (id === 'week') d.setDate(d.getDate() - 6)
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-2xl border border-line bg-panel p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-3xl font-semibold tabular-nums">{value}</p>
      <p className="mt-1 text-[11px] leading-snug text-muted">{note}</p>
    </div>
  )
}

export function StatsView({ tasks, sessions, onGoToGap }: { tasks: Task[]; sessions: WorkSession[]; onGoToGap: () => void }) {
  const [range, setRange] = useState<(typeof RANGES)[number]['id']>('week')
  const s = useMemo(() => computeStats(tasks, sessions, since(range)), [tasks, sessions, range])

  if (sessions.length === 0 && tasks.every((t) => !t.completed)) {
    return (
      <div className="rounded-2xl border border-dashed border-line px-5 py-10 text-center">
        <p className="text-base font-semibold">Todavía no hay actividad</p>
        <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-muted">
          Cuando termines tu primera sesión verás aquí el tiempo invertido y lo que has avanzado.
        </p>
        <button onClick={onGoToGap} className="mt-5 min-h-11 rounded-xl bg-accent px-5 text-sm font-semibold text-ink">
          Buscar algo para mi hueco
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div role="group" aria-label="Periodo" className="flex gap-2">
        {RANGES.map((r) => (
          <button
            key={r.id}
            onClick={() => setRange(r.id)}
            aria-pressed={range === r.id}
            className={`min-h-11 rounded-full border px-4 text-sm ${
              range === r.id ? 'border-accent bg-accent font-semibold text-ink' : 'border-line text-muted hover:text-white'
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Tiempo invertido" value={formatMinutes(s.minutesInvested)} note={`${s.sessions} ${s.sessions === 1 ? 'sesión' : 'sesiones'}`} />
        <Stat label="Progreso completado" value={`+${s.progressGained} pts`} note="Avance declarado o por hitos" />
        <Stat label="Tareas terminadas" value={String(s.tasksCompleted)} note="Al 100%" />
        <Stat label="Tareas en progreso" value={String(s.tasksInProgress)} note={`Progreso medio ${s.averageProgressInProgress}%`} />
      </div>
      <p className="text-xs leading-relaxed text-muted">
        Tiempo y progreso son cosas distintas: dedicar horas no implica avance. El progreso solo cambia cuando lo
        actualizas o completas hitos. «Tareas en progreso» muestra el estado actual; lo demás depende del periodo elegido.
      </p>
    </div>
  )
}
