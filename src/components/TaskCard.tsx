import { useState } from 'react'
import {
  addMilestone,
  effectivePct,
  remainingMinutes,
  setManualProgress,
  setTrackingMode,
  toggleMilestone,
} from '../lib/progress'
import { formatMinutes } from '../lib/stats'
import type { Task } from '../types'
import { newId } from '../hooks/useGap'
import { ProgressBar } from './ProgressBar'

const TYPE_LABEL = { quick: 'Rápida', long: 'Larga', milestones: 'Por hitos' } as const

export function TaskCard({
  task,
  onChange,
  onDelete,
  onWork,
}: {
  task: Task
  onChange: (t: Task) => void
  onDelete: () => void
  onWork: () => void
}) {
  const [open, setOpen] = useState(false)
  const [newMs, setNewMs] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const pct = effectivePct(task)
  const left = remainingMinutes(task)
  const now = () => new Date().toISOString()

  function run(fn: () => Task) {
    try {
      onChange(fn())
      setErr(null)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Operación no válida')
    }
  }

  return (
    <article className="rounded-2xl border border-line bg-panel p-5 transition hover:border-white/15">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className={`truncate text-base font-medium ${task.completed ? 'text-muted line-through' : ''}`}>
            {task.title}
          </h3>
          <span className="mt-1 inline-block rounded-full border border-line px-2 py-0.5 text-[11px] text-muted">
            {TYPE_LABEL[task.type]}
          </span>
        </div>
        {!task.completed && (
          <button
            onClick={onWork}
            className="shrink-0 rounded-full bg-accent px-4 py-1.5 text-sm font-semibold text-black transition hover:brightness-110 active:scale-95"
          >
            Trabajar
          </button>
        )}
      </div>

      <div className="mt-4 space-y-2">
        <ProgressBar value={pct} label={`Progreso de ${task.title}`} />
        <div className="flex flex-wrap justify-between gap-x-4 text-xs text-muted">
          <span className="font-medium text-white">{pct}% completado</span>
          <span>
            {formatMinutes(task.actualMinutesSpent)} invertidos
            {task.estimatedTotalMinutes != null && ` · ${formatMinutes(task.estimatedTotalMinutes)} estimados`}
            {left != null && !task.completed && ` · ~${formatMinutes(left)} restantes`}
          </span>
        </div>
      </div>

      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="mt-3 text-xs text-muted transition hover:text-white"
      >
        {open ? 'Ocultar detalle' : 'Detalle y progreso'}
      </button>

      {open && (
        <div className="mt-3 space-y-4 border-t border-line pt-4">
          {task.milestones.length > 0 && (
            <ul className="space-y-1.5">
              {task.milestones.map((m) => (
                <li key={m.id}>
                  <label className="flex cursor-pointer items-center gap-3 text-sm">
                    <input
                      type="checkbox"
                      checked={m.done}
                      onChange={() => run(() => toggleMilestone(task, m.id, now()))}
                      className="size-4 accent-[var(--color-accent)]"
                    />
                    <span className={m.done ? 'text-muted line-through' : ''}>{m.title}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (!newMs.trim()) return
              run(() => addMilestone(task, newMs, newId()))
              setNewMs('')
            }}
            className="flex gap-2"
          >
            <input
              value={newMs}
              onChange={(e) => setNewMs(e.target.value)}
              placeholder="Nuevo hito"
              className="min-w-0 flex-1 rounded-lg border border-line bg-ink px-3 py-1.5 text-sm"
            />
            <button className="rounded-lg border border-line px-3 text-sm hover:border-white/25">Añadir</button>
          </form>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-muted">
              <span>Cálculo del progreso</span>
              <div className="flex rounded-lg border border-line p-0.5">
                {(['manual', 'milestones'] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => run(() => setTrackingMode(task, m, now()))}
                    aria-pressed={task.progressTrackingMode === m}
                    className={`rounded-md px-2.5 py-1 ${task.progressTrackingMode === m ? 'bg-white/10 text-white' : ''}`}
                  >
                    {m === 'manual' ? 'Manual' : 'Por hitos'}
                  </button>
                ))}
              </div>
            </div>
            {task.progressTrackingMode === 'manual' ? (
              <label className="flex items-center gap-3 text-sm">
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={pct}
                  aria-label="Porcentaje completado"
                  onChange={(e) => run(() => setManualProgress(task, Number(e.target.value), now()))}
                  className="flex-1"
                />
                <span className="w-10 text-right tabular-nums">{pct}%</span>
              </label>
            ) : (
              <p className="text-xs text-muted">El porcentaje se calcula con los hitos completados.</p>
            )}
          </div>

          {err && <p role="alert" className="text-sm text-rose-300">{err}</p>}
          <button
            onClick={() => window.confirm(`¿Eliminar «${task.title}» y su historial?`) && onDelete()}
            className="text-xs text-rose-300/80 hover:text-rose-300"
          >
            Eliminar tarea
          </button>
        </div>
      )}
    </article>
  )
}
