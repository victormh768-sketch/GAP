import type { Task, WorkSession } from '../types'
import { clampPct, effectivePct, nextMilestone, setManualProgress, toggleMilestone } from './progress'

export const MAX_SESSION_MINUTES = 1440

export interface ActiveSession {
  taskId: string
  goal: string
  startedAt: string
  timerEnabled: boolean
  /** Milisegundos acumulados hasta la última pausa. */
  accumulatedMs: number
  /** Instante (ms epoch) del último reinicio; null si está en pausa. */
  resumedAt: number | null
}

export function defaultGoal(task: Task, availableMinutes?: number): string {
  const next = nextMilestone(task)
  if (next) return `Hito: ${next.title}`
  if (availableMinutes) return `Avanzar ${availableMinutes} min en «${task.title}»`
  return `Avanzar en «${task.title}»`
}

export function startSession(
  task: Task,
  opts: { goal?: string; timerEnabled?: boolean; now: number },
): ActiveSession {
  if (task.completed) throw new Error('La tarea ya está terminada')
  return {
    taskId: task.id,
    goal: opts.goal?.trim() || defaultGoal(task),
    startedAt: new Date(opts.now).toISOString(),
    timerEnabled: opts.timerEnabled ?? true,
    accumulatedMs: 0,
    resumedAt: opts.timerEnabled === false ? null : opts.now,
  }
}

export function pauseSession(s: ActiveSession, now: number): ActiveSession {
  if (s.resumedAt == null) return s
  return { ...s, accumulatedMs: s.accumulatedMs + Math.max(0, now - s.resumedAt), resumedAt: null }
}

export function resumeSession(s: ActiveSession, now: number): ActiveSession {
  if (s.resumedAt != null) return s
  return { ...s, resumedAt: now }
}

export function elapsedMs(s: ActiveSession, now: number): number {
  return s.accumulatedMs + (s.resumedAt != null ? Math.max(0, now - s.resumedAt) : 0)
}

export interface FinishInput {
  now: number
  /** Minutos manuales (obligatorio si no hubo temporizador; si hay temporizador, tiene prioridad el medido). */
  manualMinutes?: number
  /** Nuevo % (solo modo manual). */
  progressPct?: number
  /** Hitos marcados como hechos durante la sesión (solo se marcan, no se desmarcan). */
  completedMilestoneIds?: string[]
}

export interface FinishResult {
  task: Task
  session: WorkSession
}

/**
 * Cierra la sesión: acumula el tiempo sin sobrescribirlo, aplica hitos y/o
 * porcentaje manual y devuelve la tarea actualizada más el registro histórico.
 */
export function finishSession(
  task: Task,
  active: ActiveSession,
  input: FinishInput,
  sessionId: string,
): FinishResult {
  if (task.id !== active.taskId) throw new Error('La sesión no corresponde a esta tarea')
  const nowIso = new Date(input.now).toISOString()
  const before = effectivePct(task)

  const measured = active.timerEnabled ? Math.round(elapsedMs(pauseSession(active, input.now), input.now) / 60000) : 0
  const raw = active.timerEnabled ? measured : (input.manualMinutes ?? 0)
  if (!Number.isFinite(raw) || raw < 0) throw new Error('Tiempo no válido')
  const minutes = Math.min(MAX_SESSION_MINUTES, Math.round(raw))

  let updated: Task = task
  for (const id of input.completedMilestoneIds ?? []) {
    const m = updated.milestones.find((x) => x.id === id)
    if (m && !m.done) updated = toggleMilestone(updated, id, nowIso)
  }
  if (input.progressPct != null && updated.progressTrackingMode === 'manual') {
    updated = setManualProgress(updated, input.progressPct, nowIso)
  }

  updated = { ...updated, actualMinutesSpent: updated.actualMinutesSpent + minutes }
  const after = clampPct(effectivePct(updated))

  return {
    task: updated,
    session: {
      id: sessionId,
      taskId: task.id,
      goal: active.goal,
      startedAt: active.startedAt,
      minutesSpent: minutes,
      progressBefore: before,
      progressAfter: after,
    },
  }
}
