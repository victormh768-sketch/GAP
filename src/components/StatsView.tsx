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
      <p className="mt-1 text-2xl font-light tabular-nums">{value}</p>
      <p className="mt-1 text-[11px] leading-snug text-muted">{note}</p>
    </div>
  )
}

export function StatsView({ tasks, sessions }: { tasks: Task[]; sessions: WorkSession[] }) {
  const [range, setRange] = useState<(typeof RANGES)[number]['id']>('week')
  const s = useMemo(() => computeStats(tasks, sessions, since(range)), [tasks, sessions, range])

  return (
    <div className="space-y-5">
      <div className="flex gap-2">
        {RANGES.map((r) => (
          <button
            key={r.id}
            onClick={() => setRange(r.id)}
            aria-pressed={range === r.id}
            className={`rounded-full border px-3.5 py-1 text-xs ${range === r.id ? 'border-accent/60 bg-accent/10' : 'border-line text-muted'}`}
          >
            {r.label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Tiempo invertido" value={formatMinutes(s.minutesInvested)} note={`${s.sessions} sesiones`} />
        <Stat label="Progreso completado" value={`+${s.progressGained} pts`} note="Avance real declarado o por hitos" />
        <Stat label="Tareas terminadas" value={String(s.tasksCompleted)} note="Al 100%" />
        <Stat label="Tareas en progreso" value={String(s.tasksInProgress)} note={`Progreso medio ${s.averageProgressInProgress}%`} />
      </div>
      <p className="text-xs leading-relaxed text-muted">
        El tiempo invertido y el progreso son medidas distintas: dedicar horas no implica avance. El progreso solo cambia
        cuando lo actualizas o completas hitos.
      </p>
    </div>
  )
}
