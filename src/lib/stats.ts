import type { Task, WorkSession } from '../types'
import { effectivePct } from './progress'

export interface Stats {
  /** Tiempo invertido (minutos) en sesiones del periodo. */
  minutesInvested: number
  sessions: number
  /** Puntos porcentuales de progreso ganados en sesiones del periodo. */
  progressGained: number
  tasksCompleted: number
  tasksInProgress: number
  /** Progreso medio de las tareas en curso (0-100). */
  averageProgressInProgress: number
  milestonesDone: number
}

/** Una tarea está en progreso si no está terminada y ya tiene avance o tiempo. */
export function isInProgress(task: Task): boolean {
  return !task.completed && (effectivePct(task) > 0 || task.actualMinutesSpent > 0)
}

export function computeStats(tasks: Task[], sessions: WorkSession[], sinceIso?: string): Stats {
  const inRange = sinceIso ? sessions.filter((s) => s.startedAt >= sinceIso) : sessions
  const inProgress = tasks.filter(isInProgress)
  return {
    minutesInvested: inRange.reduce((a, s) => a + s.minutesSpent, 0),
    sessions: inRange.length,
    progressGained: inRange.reduce((a, s) => a + Math.max(0, s.progressAfter - s.progressBefore), 0),
    tasksCompleted: tasks.filter((t) => t.completed && (!sinceIso || (t.completedAt ?? '') >= sinceIso)).length,
    tasksInProgress: inProgress.length,
    averageProgressInProgress: inProgress.length
      ? Math.round(inProgress.reduce((a, t) => a + effectivePct(t), 0) / inProgress.length)
      : 0,
    milestonesDone: tasks.reduce((a, t) => a + t.milestones.filter((m) => m.done).length, 0),
  }
}

export function formatMinutes(min: number): string {
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `${h} h ${m} min` : `${h} h`
}

export function formatClock(ms: number) {
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const p = (n: number) => String(n).padStart(2, '0')
  return h ? `${h}:${p(m)}:${p(sec)}` : `${p(m)}:${p(sec)}`
}
