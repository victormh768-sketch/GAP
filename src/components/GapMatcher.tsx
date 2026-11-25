import { useMemo, useState } from 'react'
import { recommend } from '../lib/matching'
import { effectivePct } from '../lib/progress'
import type { Match, Task } from '../types'
import { ProgressBar } from './ProgressBar'

const PRESETS = [10, 20, 30, 45, 60, 90]

function Section({
  title,
  subtitle,
  matches,
  onStart,
  cta,
}: {
  title: string
  subtitle: string
  matches: Match[]
  onStart?: (m: Match) => void
  cta?: string
}) {
  if (matches.length === 0) return null
  return (
    <section className="space-y-2">
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="text-xs text-muted">{subtitle}</p>
      </div>
      <ul className="space-y-2">
        {matches.map((m) => (
          <li key={m.task.id} className="space-y-2 rounded-2xl border border-line bg-panel p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-medium">{m.task.title}</p>
                <p className="text-xs text-muted">{m.reason}</p>
              </div>
              {onStart && (
                <button onClick={() => onStart(m)} className="shrink-0 rounded-full bg-white px-3.5 py-1.5 text-xs font-semibold text-black active:scale-95">
                  {cta}
                </button>
              )}
            </div>
            {m.task.type !== 'quick' && <ProgressBar value={effectivePct(m.task)} />}
          </li>
        ))}
      </ul>
    </section>
  )
}

export function GapMatcher({ tasks, onStart }: { tasks: Task[]; onStart: (task: Task, goal: string) => void }) {
  const [minutes, setMinutes] = useState(20)
  const rec = useMemo(() => recommend(tasks, minutes), [tasks, minutes])
  const none = rec.complete.length + rec.advance.length + rec.unsuitable.length === 0

  return (
    <div className="space-y-6">
      <div className="space-y-3 rounded-2xl border border-line bg-panel p-5">
        <label className="flex items-baseline justify-between text-sm text-muted">
          Tiempo disponible
          <span className="text-2xl font-light tabular-nums text-white">{minutes} min</span>
        </label>
        <input type="range" min={5} max={120} step={5} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} aria-label="Minutos disponibles" className="w-full" />
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p}
              onClick={() => setMinutes(p)}
              aria-pressed={minutes === p}
              className={`rounded-full border px-3 py-1 text-xs ${minutes === p ? 'border-accent/60 bg-accent/10' : 'border-line text-muted hover:text-white'}`}
            >
              {p} min
            </button>
          ))}
        </div>
      </div>

      {none && <p className="py-8 text-center text-sm text-muted">No hay tareas pendientes. Añade alguna en la pestaña Tareas.</p>}

      <Section
        title="Puedes completarla"
        subtitle="Cabe entera en tu hueco"
        matches={rec.complete}
        cta="Terminar"
        onStart={(m) => onStart(m.task, m.goal)}
      />
      <Section
        title="Puedes avanzar"
        subtitle="No se termina ahora, pero el progreso se guarda"
        matches={rec.advance}
        cta={`Avanzar ${minutes} min`}
        onStart={(m) => onStart(m.task, m.goal)}
      />
      <Section title="No adecuada ahora" subtitle="Mejor para otro momento" matches={rec.unsuitable} />
    </div>
  )
}
