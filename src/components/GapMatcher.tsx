import { useEffect, useMemo, useState } from 'react'
import { MAX_PLAN_MINUTES, planGap, recommend, type Plan, type PlanItem } from '../lib/matching'
import { effectivePct } from '../lib/progress'
import type { Match, Task } from '../types'
import { ProgressBar } from './ProgressBar'
import { GapRing } from './Ring'

const PRESETS = [10, 15, 20, 30, 45, 60, 90]
const STORAGE_KEY = 'gap:minutes'

export type StartIntent = 'complete' | 'advance'

function readSaved(): number {
  try {
    const n = Number(localStorage.getItem(STORAGE_KEY))
    return n >= 1 && n <= MAX_PLAN_MINUTES ? Math.round(n) : 20
  } catch {
    return 20
  }
}

function Chip({ kind }: { kind: StartIntent }) {
  return kind === 'complete' ? (
    <span className="kicker inline-block rounded-full bg-accent px-3 py-0.5 text-[10px] font-bold text-ink">Completar</span>
  ) : (
    <span className="kicker inline-block rounded-full border border-accent/70 px-3 py-0.5 text-[10px] font-bold text-accent">Avanzar</span>
  )
}

function Minutes({ value }: { value: number }) {
  return (
    <p className="shrink-0 text-right leading-none">
      <span className="numeral text-4xl">{value}</span>
      <span className="kicker ml-1.5 text-muted">min</span>
    </p>
  )
}

function Play() {
  return (
    <svg viewBox="0 0 24 24" className="size-3.5" fill="currentColor" aria-hidden>
      <path d="M7 4.5v15a1 1 0 0 0 1.5.86l12-7.5a1 1 0 0 0 0-1.72l-12-7.5A1 1 0 0 0 7 4.5Z" />
    </svg>
  )
}

function StartButton({
  minutes,
  blocked,
  onClick,
  primary = true,
}: {
  minutes: number
  blocked: boolean
  onClick: () => void
  primary?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={blocked}
      className={`kicker flex min-h-12 w-full items-center justify-center gap-2.5 rounded-full px-5 text-xs font-bold transition active:scale-[0.99] ${
        primary
          ? 'bg-accent text-ink shadow-[0_0_28px_-6px_rgb(182_243_107/0.6)] hover:brightness-110'
          : 'border border-line text-white hover:border-accent/60'
      }`}
    >
      <Play />
      Empezar {minutes} min
    </button>
  )
}

function PlanCard({ item, blocked, onStart }: { item: PlanItem; blocked: boolean; onStart: () => void }) {
  return (
    <li className="space-y-3 rounded-3xl border border-line bg-panel/90 p-4 shadow-[inset_0_1px_0_rgb(255_255_255/0.04)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-2">
          <Chip kind={item.kind} />
          <p className="break-words text-base font-semibold leading-snug">{item.task.title}</p>
        </div>
        <Minutes value={item.minutes} />
      </div>
      <p className="serif-accent text-[15px] leading-snug text-muted">— {item.reason}</p>
      {item.kind === 'advance' && <ProgressBar value={effectivePct(item.task)} label={`Progreso de ${item.task.title}`} />}
      <StartButton minutes={item.minutes} blocked={blocked} onClick={onStart} />
    </li>
  )
}

function EmptyBox({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-3xl border border-dashed border-line px-5 py-9 text-center">
      <p className="serif-accent text-2xl">{title}</p>
      <div className="mx-auto mt-3 max-w-xs space-y-4 text-sm leading-relaxed text-muted">{children}</div>
    </div>
  )
}

const stepBtn =
  'grid size-11 shrink-0 place-items-center rounded-full border border-line text-xl text-muted transition hover:border-accent/60 hover:text-white active:scale-95'

export function GapMatcher({
  tasks,
  activeSessionTitle,
  onOpenSession,
  onStart,
  onAddTask,
}: {
  tasks: Task[]
  /** Título de la tarea con sesión en curso, si la hay. */
  activeSessionTitle: string | null
  onOpenSession: () => void
  onStart: (task: Task, goal: string, minutes: number, intent: StartIntent) => void
  onAddTask: () => void
}) {
  const [text, setText] = useState(() => String(readSaved()))
  const [planIdx, setPlanIdx] = useState(0)

  const parsed = /^\d{1,3}$/.test(text) ? Number(text) : NaN
  const minutes = parsed >= 1 && parsed <= MAX_PLAN_MINUTES ? parsed : null

  useEffect(() => {
    if (minutes == null) return
    try {
      localStorage.setItem(STORAGE_KEY, String(minutes))
    } catch {
      /* sin almacenamiento: simplemente no se recuerda */
    }
  }, [minutes])

  const setMinutes = (n: number) => {
    setText(String(Math.min(MAX_PLAN_MINUTES, Math.max(1, Math.round(n)))))
    setPlanIdx(0)
  }

  const pending = useMemo(() => tasks.filter((t) => !t.completed), [tasks])
  const plans = useMemo(() => (minutes ? planGap(tasks, minutes) : []), [tasks, minutes])
  const rec = useMemo(() => recommend(tasks, minutes ?? 0), [tasks, minutes])
  const plan = plans[Math.min(planIdx, Math.max(0, plans.length - 1))] as Plan | undefined

  const inPlan = new Set(plan?.items.map((i) => i.task.id))
  const others: Match[] = [...rec.complete, ...rec.advance].filter((m) => !inPlan.has(m.task.id))
  const blocked = activeSessionTitle !== null

  const summary =
    plan && minutes
      ? `${plan.usedMinutes} de ${minutes} min` +
        (plan.completes ? ` · completas ${plan.completes}` : '') +
        (plan.advances ? ` · avanzas ${plan.advances}` : '') +
        (plan.freeMinutes ? ` · ${plan.freeMinutes} min libres` : '')
      : ''

  return (
    <div className="space-y-8">
      {blocked && (
        <div className="flex items-center justify-between gap-3 rounded-3xl border border-accent/40 bg-accent/10 px-4 py-3 text-sm">
          <p className="min-w-0">
            Sesión en curso: <span className="font-semibold">{activeSessionTitle}</span>
          </p>
          <button onClick={onOpenSession} className="kicker min-h-11 shrink-0 rounded-full bg-accent px-5 text-xs font-bold text-ink">
            Abrir
          </button>
        </div>
      )}

      <section aria-labelledby="hueco-titulo" className="space-y-5">
        <h2 id="hueco-titulo" className="kicker text-center text-muted">
          ¿Cuánto tiempo tienes?
        </h2>

        <div className="flex items-center justify-center gap-2">
          <button onClick={() => setMinutes((minutes ?? 20) - 5)} aria-label="Menos 5 minutos" className={stepBtn}>
            ‹
          </button>
          <GapRing plan={plan} available={minutes}>
            <label className="grid place-items-center">
              <input
                value={text}
                onChange={(e) => {
                  setText(e.target.value.replace(/\D/g, '').slice(0, 3))
                  setPlanIdx(0)
                }}
                onFocus={(e) => e.target.select()}
                inputMode="numeric"
                pattern="[0-9]*"
                aria-label="Minutos disponibles"
                aria-invalid={minutes == null}
                style={{ width: `${Math.max(2, text.length) + 0.3}ch` }}
                className="numeral bg-transparent text-center text-[64px] leading-none caret-accent focus:outline-none"
              />
              <span className="kicker mt-1 text-muted">minutos</span>
            </label>
          </GapRing>
          <button onClick={() => setMinutes((minutes ?? 15) + 5)} aria-label="Más 5 minutos" className={stepBtn}>
            ›
          </button>
        </div>

        {minutes == null && (
          <p role="alert" className="text-center text-sm text-danger">
            Escribe un número de minutos entre 1 y {MAX_PLAN_MINUTES}.
          </p>
        )}
        <div className="flex flex-wrap justify-center gap-2">
          {PRESETS.map((p) => (
            <button
              key={p}
              onClick={() => setMinutes(p)}
              aria-pressed={minutes === p}
              className={`min-h-10 min-w-12 rounded-full border px-3.5 font-mono text-sm transition ${
                minutes === p ? 'border-accent bg-accent font-bold text-ink' : 'border-line text-muted hover:text-white'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </section>

      <p className="sr-only-live" role="status" aria-live="polite">
        {summary}
      </p>

      {tasks.length === 0 && (
        <EmptyBox title="Aquí decides qué hacer con tu tiempo libre">
          <p>Añade tus tareas con una estimación y GAP te dirá cuáles caben en cada hueco, o en cuáles puedes avanzar.</p>
          <button onClick={onAddTask} className="kicker min-h-12 rounded-full bg-accent px-6 text-xs font-bold text-ink">
            Añadir mi primera tarea
          </button>
        </EmptyBox>
      )}

      {tasks.length > 0 && pending.length === 0 && (
        <EmptyBox title="Todo hecho">
          <p>No te queda nada pendiente. Añade algo nuevo cuando lo necesites.</p>
          <button onClick={onAddTask} className="kicker min-h-12 rounded-full bg-accent px-6 text-xs font-bold text-ink">
            Añadir una tarea
          </button>
        </EmptyBox>
      )}

      {minutes != null && pending.length > 0 && plans.length === 0 && (
        <EmptyBox title={`Nada encaja en ${minutes} min`}>
          <p>Prueba con más tiempo, o divide tus tareas largas en hitos para poder avanzarlas en huecos pequeños.</p>
        </EmptyBox>
      )}

      {plan && minutes != null && (
        <section aria-labelledby="plan-titulo" className="space-y-4">
          <div className="space-y-3 text-center">
            <h2 id="plan-titulo" className="kicker text-muted">
              {plans.length > 1 ? 'Tus mejores opciones' : 'Tu mejor opción'}
            </h2>
            <p className="serif-accent text-xl text-accent">— {summary}</p>
            {plans.length > 1 && (
              <div role="group" aria-label="Elegir combinación" className="grid grid-flow-col auto-cols-fr gap-1 rounded-full border border-line bg-panel p-1">
                {plans.map((p, i) => (
                  <button
                    key={p.id}
                    onClick={() => setPlanIdx(i)}
                    aria-pressed={plan.id === p.id}
                    className={`min-h-11 rounded-full px-2 text-[13px] transition ${
                      plan.id === p.id ? 'bg-accent font-bold text-ink' : 'text-muted hover:text-white'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <ul className="space-y-3">
            {plan.items.map((item) => (
              <PlanCard
                key={item.task.id}
                item={item}
                blocked={blocked}
                onStart={() => onStart(item.task, item.goal, item.minutes, item.kind)}
              />
            ))}
          </ul>
        </section>
      )}

      {others.length > 0 && (
        <section aria-labelledby="otras-titulo" className="space-y-3">
          <h2 id="otras-titulo" className="kicker text-muted">
            Otras tareas que también encajan
          </h2>
          <ul className="space-y-2">
            {others.map((m) => (
              <li key={m.task.id} className="space-y-3 rounded-3xl border border-line px-4 py-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1.5">
                    <Chip kind={m.kind as StartIntent} />
                    <p className="break-words font-medium leading-snug">{m.task.title}</p>
                    <p className="text-xs leading-snug text-muted">{m.reason}</p>
                  </div>
                  <Minutes value={m.suggestedMinutes} />
                </div>
                <StartButton
                  primary={false}
                  minutes={m.suggestedMinutes}
                  blocked={blocked}
                  onClick={() => onStart(m.task, m.goal, m.suggestedMinutes, m.kind as StartIntent)}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      {minutes != null && rec.unsuitable.length > 0 && (
        <details className="group rounded-3xl border border-line">
          <summary className="kicker flex min-h-12 cursor-pointer list-none items-center justify-between px-5 text-muted">
            <span>No encajan ahora ({rec.unsuitable.length})</span>
            <span aria-hidden className="transition group-open:rotate-180">⌄</span>
          </summary>
          <ul className="space-y-3 border-t border-line px-5 py-3.5">
            {rec.unsuitable.map((m) => (
              <li key={m.task.id}>
                <p className="break-words text-sm font-medium">{m.task.title}</p>
                <p className="text-xs leading-snug text-muted">{m.reason}</p>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}
