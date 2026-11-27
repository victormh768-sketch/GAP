import { useEffect, useRef, useState } from 'react'
import { newId } from '../hooks/useGap'
import { friendlyError } from '../lib/errors'
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
import { formatClock as clock } from '../lib/stats'
import type { Task } from '../types'
import { ProgressBar } from './ProgressBar'

export function SessionPanel({
  task,
  initialGoal,
  active,
  setActive,
  onClose,
  onMinimize,
  onDiscard,
  onFinish,
}: {
  task: Task
  initialGoal: string
  active: ActiveSession | null
  setActive: (s: ActiveSession | null) => void
  /** Cierra el panel antes de empezar. */
  onClose: () => void
  /** Oculta el panel sin parar la sesión. */
  onMinimize: () => void
  onDiscard: () => void
  /** Devuelve null si se guardó, o el mensaje de error. */
  onFinish: (r: FinishResult) => Promise<string | null>
}) {
  const [goal, setGoal] = useState(initialGoal)
  const [timer, setTimer] = useState(true)
  const [tick, setTick] = useState(() => Date.now())
  const [pct, setPct] = useState(effectivePct(task))
  const [doneIds, setDoneIds] = useState<string[]>([])
  const [markDone, setMarkDone] = useState(active?.intent === 'complete')
  const [manualMin, setManualMin] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!active || active.resumedAt == null) return
    const id = setInterval(() => setTick(Date.now()), 1000)
    return () => clearInterval(id)
  }, [active])

  useEffect(() => {
    dialogRef.current?.focus()
  }, [])

  const leave = active ? onMinimize : onClose
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && leave()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [leave])

  const manualMode = task.progressTrackingMode === 'manual'
  const pending = task.milestones.filter((m) => !m.done)
  const elapsed = active ? elapsedMs(active, tick) : 0
  const target = active?.targetMinutes
  const reached = target != null && elapsed >= target * 60000

  async function save() {
    if (!active || saving) return
    setErr(null)
    setSaving(true)
    let result: FinishResult
    try {
      result = finishSession(
        task,
        active,
        {
          now: Date.now(),
          manualMinutes: manualMin === '' ? 0 : Number(manualMin),
          progressPct: manualMode && !markDone ? pct : undefined,
          completedMilestoneIds: markDone ? undefined : doneIds,
          markDone,
        },
        newId(),
      )
    } catch (e) {
      setErr(friendlyError(e))
      setSaving(false)
      return
    }
    const message = await onFinish(result)
    if (message) setErr(message)
    setSaving(false)
  }

  const previewMilestones = task.milestones.map((m) => (doneIds.includes(m.id) ? { ...m, done: true } : m))

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/75 backdrop-blur-sm sm:items-center sm:p-6">
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sesion-titulo"
        className="max-h-[92dvh] w-full max-w-md space-y-5 overflow-y-auto rounded-t-3xl border border-line bg-panel p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] focus:outline-none sm:rounded-3xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-widest text-accent">Sesión de trabajo</p>
            <h2 id="sesion-titulo" className="mt-1 break-words text-xl font-semibold leading-snug">
              {task.title}
            </h2>
          </div>
          {active && (
            <button
              onClick={onMinimize}
              className="min-h-11 shrink-0 rounded-xl border border-line px-3 text-sm text-muted hover:text-white"
            >
              Minimizar
            </button>
          )}
        </div>

        {!active ? (
          <>
            <label className="block space-y-2 text-sm">
              <span className="text-muted">Objetivo de la sesión</span>
              <input
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                maxLength={300}
                className="min-h-12 w-full rounded-xl border border-line bg-ink px-3.5"
              />
            </label>
            <label className="flex min-h-11 items-center gap-3 text-sm">
              <input type="checkbox" checked={timer} onChange={(e) => setTimer(e.target.checked)} className="size-5 accent-[var(--color-accent)]" />
              Usar temporizador
            </label>
            <div className="flex gap-2">
              <button onClick={onClose} className="min-h-12 flex-1 rounded-xl border border-line text-sm">
                Cancelar
              </button>
              <button
                onClick={() => {
                  try {
                    setActive(startSession(task, { goal, timerEnabled: timer, now: Date.now() }))
                  } catch (e) {
                    setErr(friendlyError(e))
                  }
                }}
                className="min-h-12 flex-1 rounded-xl bg-accent text-sm font-semibold text-ink"
              >
                Empezar
              </button>
            </div>
            {err && <p role="alert" className="text-sm text-danger">{err}</p>}
          </>
        ) : (
          <>
            <p className="rounded-xl bg-ink px-3.5 py-2.5 text-sm text-muted">
              Objetivo: <span className="text-white">{active.goal}</span>
            </p>

            {active.timerEnabled ? (
              <div className="space-y-3 text-center">
                <div className="text-6xl font-semibold tabular-nums tracking-tight" aria-label={`Tiempo transcurrido ${clock(elapsed)}`}>
                  {clock(elapsed)}
                </div>
                {target != null && (
                  <div className="space-y-1.5">
                    <ProgressBar value={Math.min(100, (elapsed / (target * 60000)) * 100)} label="Tiempo respecto al objetivo" />
                    <p className="text-xs text-muted" role="status">
                      {reached ? `Has cumplido tus ${target} min. Puedes seguir o finalizar.` : `Objetivo de tiempo: ${target} min`}
                    </p>
                  </div>
                )}
                <button
                  onClick={() => setActive(active.resumedAt == null ? resumeSession(active, Date.now()) : pauseSession(active, Date.now()))}
                  className="min-h-11 rounded-full border border-line px-6 text-sm hover:border-accent/60"
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
                  inputMode="numeric"
                  value={manualMin}
                  onChange={(e) => setManualMin(e.target.value)}
                  className="min-h-11 w-24 rounded-xl border border-line bg-ink px-3"
                />
              </label>
            )}

            <label className="flex min-h-11 items-center gap-3 rounded-xl border border-line px-3.5 text-sm">
              <input type="checkbox" checked={markDone} onChange={(e) => setMarkDone(e.target.checked)} className="size-5 accent-[var(--color-accent)]" />
              <span>
                <span className="font-semibold">He terminado la tarea</span>
                <span className="block text-xs text-muted">Se marcará como hecha al finalizar.</span>
              </span>
            </label>

            {!markDone && pending.length > 0 && (
              <fieldset className="space-y-1">
                <legend className="mb-1 text-xs text-muted">Hitos completados en esta sesión</legend>
                {pending.map((m) => (
                  <label key={m.id} className="flex min-h-11 items-center gap-3 text-sm">
                    <input
                      type="checkbox"
                      checked={doneIds.includes(m.id)}
                      onChange={(e) => setDoneIds((ids) => (e.target.checked ? [...ids, m.id] : ids.filter((i) => i !== m.id)))}
                      className="size-5 accent-[var(--color-accent)]"
                    />
                    <span className="break-words">{m.title}</span>
                  </label>
                ))}
              </fieldset>
            )}

            {!markDone &&
              (manualMode ? (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm text-muted">
                    <label htmlFor="sesion-progreso">¿Cuánto llevas de la tarea?</label>
                    <span className="font-semibold tabular-nums text-white">{pct}%</span>
                  </div>
                  <input id="sesion-progreso" type="range" min={0} max={100} step={5} value={pct} onChange={(e) => setPct(Number(e.target.value))} className="h-8 w-full" />
                </div>
              ) : (
                <div className="space-y-2">
                  <ProgressBar value={effectivePct({ ...task, milestones: previewMilestones })} label="Progreso por hitos" />
                  <p className="text-xs text-muted">El progreso se calcula con los hitos completados.</p>
                </div>
              ))}

            {err && <p role="alert" className="text-sm text-danger">{err}</p>}
            <div className="flex gap-2">
              <button
                onClick={() => window.confirm('¿Descartar la sesión sin guardar?') && onDiscard()}
                className="min-h-12 rounded-xl border border-line px-4 text-sm text-muted hover:text-white"
              >
                Descartar
              </button>
              <button
                onClick={() => void save()}
                disabled={saving}
                className="min-h-12 flex-1 rounded-xl bg-accent text-sm font-semibold text-ink"
              >
                {saving ? 'Guardando…' : 'Finalizar y guardar'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
