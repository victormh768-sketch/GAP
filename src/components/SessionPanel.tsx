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
import { TimerRing } from './Ring'

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
  const [finishing, setFinishing] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!active || active.resumedAt == null) return
    const id = setInterval(() => setTick(Date.now()), 1000)
    return () => clearInterval(id)
  }, [active])

  useEffect(() => {
    dialogRef.current?.focus()
  }, [])

  // Sin temporizador no hay pantalla de enfoque: se va directo al formulario de cierre.
  const showForm = !!active && (finishing || !active.timerEnabled)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (active && finishing && active.timerEnabled) setFinishing(false)
      else if (active) onMinimize()
      else onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, finishing, onMinimize, onClose])

  const manualMode = task.progressTrackingMode === 'manual'
  const pending = task.milestones.filter((m) => !m.done)
  const elapsed = active ? elapsedMs(active, tick) : 0
  const targetMs = active?.targetMinutes ? active.targetMinutes * 60000 : null
  const over = targetMs != null && elapsed > targetMs ? elapsed - targetMs : 0
  const paused = !!active && active.timerEnabled && active.resumedAt == null

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
  const mins = Math.floor(elapsed / 60000)
  const secs = Math.floor(elapsed / 1000) % 60

  const shell = 'max-h-[94dvh] w-full max-w-md overflow-y-auto rounded-t-[2rem] border border-line bg-ink/95 p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] focus:outline-none sm:rounded-[2rem]'

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/80 backdrop-blur-sm sm:items-center sm:p-6">
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sesion-titulo"
        className={`${shell} space-y-6`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="kicker truncate text-muted">Sesión · {task.title}</p>
            <h2 id="sesion-titulo" className="serif-accent mt-1 text-2xl text-accent">
              {!active ? '— preparada' : showForm ? '— ¿cómo ha ido?' : paused ? '— en pausa' : over > 0 ? '— objetivo cumplido' : '— en flujo'}
            </h2>
          </div>
          {active && (
            <button
              onClick={onMinimize}
              aria-label="Minimizar sesión"
              className="grid size-11 shrink-0 place-items-center rounded-full border border-line text-lg text-muted hover:border-accent/60 hover:text-white"
            >
              ×
            </button>
          )}
        </div>

        {!active && (
          <>
            <label className="block space-y-2 text-sm">
              <span className="kicker text-muted">Objetivo de la sesión</span>
              <input
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                maxLength={300}
                className="min-h-12 w-full rounded-2xl border border-line bg-panel px-4"
              />
            </label>
            <label className="flex min-h-11 items-center gap-3 text-sm">
              <input type="checkbox" checked={timer} onChange={(e) => setTimer(e.target.checked)} className="size-5 accent-[var(--color-accent)]" />
              Usar temporizador
            </label>
            <div className="flex gap-2">
              <button onClick={onClose} className="kicker min-h-12 flex-1 rounded-full border border-line text-xs">
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
                className="kicker min-h-12 flex-1 rounded-full bg-accent text-xs font-bold text-ink"
              >
                Empezar
              </button>
            </div>
            {err && <p role="alert" className="text-sm text-danger">{err}</p>}
          </>
        )}

        {active && !showForm && (
          <>
            <TimerRing progress={targetMs ? elapsed / targetMs : (elapsed % 3600000) / 3600000}>
              <span className="kicker text-muted">{targetMs ? (over > 0 ? 'Extra' : 'Restante') : 'Transcurrido'}</span>
              <span
                className="numeral mt-1 text-[68px] leading-none"
                aria-label={`${targetMs ? (over > 0 ? 'Extra' : 'Restante') : 'Transcurrido'} ${clock(targetMs ? (over > 0 ? over : targetMs - elapsed) : elapsed)}`}
              >
                {over > 0 ? '+' : ''}
                {clock(targetMs ? (over > 0 ? over : targetMs - elapsed) : elapsed)}
              </span>
              <span className="mt-2 font-mono text-xs tracking-wider text-accent">
                {targetMs ? `${Math.min(100, Math.round((elapsed / targetMs) * 100))}% · ` : ''}
                {mins}m {String(secs).padStart(2, '0')}s transcurridos
              </span>
            </TimerRing>

            <p className="serif-accent rounded-3xl border border-line bg-panel/80 px-5 py-5 text-center text-xl leading-snug">
              “{active.goal}”
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => setActive(paused ? resumeSession(active, Date.now()) : pauseSession(active, Date.now()))}
                className="kicker flex min-h-14 flex-1 items-center justify-center gap-3 rounded-full bg-accent text-xs font-bold text-ink shadow-[0_0_30px_-6px_rgb(182_243_107/0.55)] active:scale-[0.99]"
              >
                {paused ? (
                  <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden>
                    <path d="M7 4.5v15a1 1 0 0 0 1.5.86l12-7.5a1 1 0 0 0 0-1.72l-12-7.5A1 1 0 0 0 7 4.5Z" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden>
                    <rect x="5" y="4" width="5" height="16" rx="1" />
                    <rect x="14" y="4" width="5" height="16" rx="1" />
                  </svg>
                )}
                {paused ? 'Reanudar' : 'Pausar'}
              </button>
              <button
                onClick={() => setFinishing(true)}
                className="kicker flex min-h-14 items-center justify-center gap-2.5 rounded-full border border-danger/70 px-6 text-xs font-bold text-danger active:scale-[0.99]"
              >
                <span aria-hidden className="size-2.5 rounded-[2px] bg-danger" />
                Finalizar
              </button>
            </div>

            <p className="kicker flex justify-between text-muted">
              <span>
                Plan · <span className="text-white">{active.targetMinutes ? `${String(active.targetMinutes).padStart(2, '0')}:00` : 'libre'}</span>
              </span>
              <span>
                Progreso · <span className="text-white">{effectivePct(task)}%</span>
              </span>
            </p>
          </>
        )}

        {active && showForm && (
          <>
            {active.timerEnabled ? (
              <p className="kicker text-muted">
                Tiempo · <span className="text-white">{mins} min</span>
              </p>
            ) : (
              <label className="flex items-center gap-3 text-sm">
                <span className="kicker text-muted">Minutos dedicados</span>
                <input
                  type="number"
                  min={0}
                  max={1440}
                  inputMode="numeric"
                  value={manualMin}
                  onChange={(e) => setManualMin(e.target.value)}
                  className="min-h-11 w-24 rounded-2xl border border-line bg-panel px-3"
                />
              </label>
            )}

            <label className="flex min-h-14 items-center gap-3 rounded-3xl border border-line bg-panel/80 px-4 text-sm">
              <input type="checkbox" checked={markDone} onChange={(e) => setMarkDone(e.target.checked)} className="size-5 accent-[var(--color-accent)]" />
              <span>
                <span className="font-semibold">He terminado la tarea</span>
                <span className="block text-xs text-muted">Se marcará como hecha al guardar.</span>
              </span>
            </label>

            {!markDone && pending.length > 0 && (
              <fieldset className="space-y-1">
                <legend className="kicker mb-1 text-muted">Hitos completados en esta sesión</legend>
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
                  <div className="flex items-baseline justify-between text-sm text-muted">
                    <label htmlFor="sesion-progreso" className="kicker">¿Cuánto llevas de la tarea?</label>
                    <span className="numeral text-2xl text-white">{pct}%</span>
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

            <button
              onClick={() => void save()}
              disabled={saving}
              className="kicker min-h-14 w-full rounded-full bg-accent text-xs font-bold text-ink shadow-[0_0_30px_-6px_rgb(182_243_107/0.55)]"
            >
              {saving ? 'Guardando…' : 'Finalizar y guardar'}
            </button>
            <div className="flex items-center justify-between">
              {active.timerEnabled ? (
                <button onClick={() => setFinishing(false)} className="kicker min-h-11 px-2 text-xs text-muted hover:text-white">
                  ‹ Volver al temporizador
                </button>
              ) : (
                <span />
              )}
              <button
                onClick={() => window.confirm('¿Descartar la sesión sin guardar?') && onDiscard()}
                className="kicker min-h-11 px-2 text-xs text-danger/90 hover:text-danger"
              >
                Descartar sesión
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
