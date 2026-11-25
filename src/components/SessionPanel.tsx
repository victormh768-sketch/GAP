import { useEffect, useState } from 'react'
import { newId } from '../hooks/useGap'
import { effectivePct } from '../lib/progress'
import {
  elapsedMs,
  finishSession,
  pauseSession,
  resumeSession,
  startSession,
  type ActiveSession,
  type FinishResult,
} from '../lib/sessions'
import type { Task } from '../types'
import { ProgressBar } from './ProgressBar'

function clock(ms: number) {
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const p = (n: number) => String(n).padStart(2, '0')
  return h ? `${h}:${p(m)}:${p(sec)}` : `${p(m)}:${p(sec)}`
}

export function SessionPanel({
  task,
  initialGoal,
  active,
  setActive,
  onClose,
  onFinish,
}: {
  task: Task
  initialGoal: string
  active: ActiveSession | null
  setActive: (s: ActiveSession | null) => void
  onClose: () => void
  onFinish: (r: FinishResult) => void
}) {
  const [goal, setGoal] = useState(initialGoal)
  const [timer, setTimer] = useState(true)
  const [tick, setTick] = useState(() => Date.now())
  const [pct, setPct] = useState(effectivePct(task))
  const [doneIds, setDoneIds] = useState<string[]>([])
  const [manualMin, setManualMin] = useState('')
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (!active || active.resumedAt == null) return
    const id = setInterval(() => setTick(Date.now()), 1000)
    return () => clearInterval(id)
  }, [active])

  const manualMode = task.progressTrackingMode === 'manual'

  function save() {
    if (!active) return
    try {
      const result = finishSession(
        task,
        active,
        {
          now: Date.now(),
          manualMinutes: manualMin === '' ? 0 : Number(manualMin),
          progressPct: manualMode ? pct : undefined,
          completedMilestoneIds: doneIds,
        },
        newId(),
      )
      onFinish(result)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se pudo guardar la sesión')
    }
  }

  const pending = task.milestones.filter((m) => !m.done)

  return (
    <div role="dialog" aria-modal="true" aria-label="Sesión de trabajo" className="fixed inset-0 z-20 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-6">
      <div className="max-h-[92vh] w-full max-w-md space-y-5 overflow-y-auto rounded-t-3xl border border-line bg-panel p-6 sm:rounded-3xl">
        <header>
          <p className="text-xs uppercase tracking-widest text-muted">Sesión de trabajo</p>
          <h2 className="mt-1 text-xl font-semibold">{task.title}</h2>
        </header>

        {!active ? (
          <>
            <label className="block space-y-1.5 text-sm">
              <span className="text-muted">Objetivo de la sesión</span>
              <input
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                maxLength={300}
                className="w-full rounded-xl border border-line bg-ink px-3 py-2.5"
              />
            </label>
            <label className="flex items-center gap-3 text-sm">
              <input type="checkbox" checked={timer} onChange={(e) => setTimer(e.target.checked)} className="size-4 accent-[var(--color-accent)]" />
              Usar temporizador
            </label>
            <div className="flex gap-2">
              <button onClick={onClose} className="flex-1 rounded-xl border border-line py-2.5 text-sm">Cancelar</button>
              <button
                onClick={() => setActive(startSession(task, { goal, timerEnabled: timer, now: Date.now() }))}
                className="flex-1 rounded-xl bg-white py-2.5 text-sm font-semibold text-black"
              >
                Empezar
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="rounded-xl bg-white/[0.04] px-3 py-2 text-sm text-muted">
              Objetivo: <span className="text-white">{active.goal}</span>
            </p>

            {active.timerEnabled ? (
              <div className="space-y-3 text-center">
                <div className="text-5xl font-light tabular-nums tracking-tight" aria-live="off">
                  {clock(elapsedMs(active, tick))}
                </div>
                <button
                  onClick={() => setActive(active.resumedAt == null ? resumeSession(active, Date.now()) : pauseSession(active, Date.now()))}
                  className="rounded-full border border-line px-5 py-1.5 text-sm hover:border-white/30"
                >
                  {active.resumedAt == null ? 'Reanudar' : 'Pausar'}
                </button>
              </div>
            ) : (
              <label className="flex items-center gap-3 text-sm">
                <span className="text-muted">Minutos dedicados</span>
                <input
                  type="number"
                  min={0}
                  max={1440}
                  value={manualMin}
                  onChange={(e) => setManualMin(e.target.value)}
                  className="w-24 rounded-lg border border-line bg-ink px-3 py-1.5"
                />
              </label>
            )}

            {pending.length > 0 && (
              <fieldset className="space-y-1.5">
                <legend className="mb-1 text-xs text-muted">Hitos completados en esta sesión</legend>
                {pending.map((m) => (
                  <label key={m.id} className="flex items-center gap-3 text-sm">
                    <input
                      type="checkbox"
                      checked={doneIds.includes(m.id)}
                      onChange={(e) => setDoneIds((ids) => (e.target.checked ? [...ids, m.id] : ids.filter((i) => i !== m.id)))}
                      className="size-4 accent-[var(--color-accent)]"
                    />
                    {m.title}
                  </label>
                ))}
              </fieldset>
            )}

            {manualMode ? (
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-muted">
                  <span>Progreso de la tarea</span>
                  <span className="text-white tabular-nums">{pct}%</span>
                </div>
                <input type="range" min={0} max={100} step={5} value={pct} onChange={(e) => setPct(Number(e.target.value))} aria-label="Progreso de la tarea" className="w-full" />
              </div>
            ) : (
              <div className="space-y-2">
                <ProgressBar value={effectivePct({ ...task, milestones: task.milestones.map((m) => (doneIds.includes(m.id) ? { ...m, done: true } : m)) })} />
                <p className="text-xs text-muted">El progreso se calcula por hitos.</p>
              </div>
            )}

            {err && <p role="alert" className="text-sm text-rose-300">{err}</p>}
            <div className="flex gap-2">
              <button
                onClick={() => window.confirm('¿Descartar la sesión sin guardar?') && (setActive(null), onClose())}
                className="rounded-xl border border-line px-4 py-2.5 text-sm text-muted"
              >
                Descartar
              </button>
              <button onClick={save} className="flex-1 rounded-xl bg-accent py-2.5 text-sm font-semibold text-black">
                Finalizar y guardar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
