import type { Task, WorkSession } from '../types'
import { clampPct, effectivePct, markDone, nextMilestone, setManualProgress, toggleMilestone } from './progress'

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
  /** Minutos que GAP recomendó dedicar (opcional; sesiones antiguas no lo tienen). */
  targetMinutes?: number
  /** Para qué se empezó: terminar la tarea o solo avanzar. */
  intent?: 'complete' | 'advance'
}

/** Valida una sesión activa leída de almacenamiento. Devuelve null si está dañada. */
export function parseActiveSession(raw: unknown): ActiveSession | null {
  if (!raw || typeof raw !== 'object') return null
  const s = raw as Record<string, unknown>
  if (typeof s.taskId !== 'string' || typeof s.goal !== 'string' || typeof s.startedAt !== 'string') return null
  if (typeof s.timerEnabled !== 'boolean' || typeof s.accumulatedMs !== 'number' || !(s.accumulatedMs >= 0)) return null
  if (s.resumedAt !== null && typeof s.resumedAt !== 'number') return null
  return {
    taskId: s.taskId,
    goal: s.goal,
    startedAt: s.startedAt,
    timerEnabled: s.timerEnabled,
    accumulatedMs: s.accumulatedMs,
    resumedAt: s.resumedAt as number | null,
    targetMinutes: typeof s.targetMinutes === 'number' && s.targetMinutes > 0 ? s.targetMinutes : undefined,
    intent: s.intent === 'complete' || s.intent === 'advance' ? s.intent : undefined,
  }
}

export function defaultGoal(task: Task, availableMinutes?: number): string {
  const next = nextMilestone(task)
  if (next) return `Hito: ${next.title}`
  if (availableMinutes) return `Avanzar ${availableMinutes} min en «${task.title}»`
  return `Avanzar en «${task.title}»`
}

export function startSession(
  task: Task,
  opts: {
    goal?: string
    timerEnabled?: boolean
    now: number
    targetMinutes?: number
    intent?: 'complete' | 'advance'
  },
): ActiveSession {
  if (task.completed) throw new Error('La tarea ya está terminada')
  return {
    taskId: task.id,
    goal: opts.goal?.trim() || defaultGoal(task),
    startedAt: new Date(opts.now).toISOString(),
    timerEnabled: opts.timerEnabled ?? true,
    accumulatedMs: 0,
    resumedAt: opts.timerEnabled === false ? null : opts.now,
    targetMinutes: opts.targetMinutes && opts.targetMinutes > 0 ? Math.round(opts.targetMinutes) : undefined,
    intent: opts.intent,
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
  /** Marca la tarea entera como terminada (prevalece sobre el resto del progreso). */
  markDone?: boolean
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

  if (input.markDone) updated = markDone(updated, nowIso)

  updated = { ...updated, actualMinutesSpent: updated.actualMinutesSpent + minutes }
  const after = clampPct(effectivePct(updated))

  // Una sesión sin tiempo ni avance es casi siempre accidental y ensucia las estadísticas.
  if (minutes === 0 && after === before && !input.markDone) {
    throw new Error('Esta sesión no tiene tiempo ni avance que guardar. Trabaja un poco más o descártala.')
  }

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
