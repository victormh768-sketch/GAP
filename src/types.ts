export type TaskType = 'quick' | 'long' | 'milestones'
export type ProgressMode = 'manual' | 'milestones'

export interface Milestone {
  id: string
  title: string
  done: boolean
  position: number
  completedAt: string | null
}

export interface Task {
  id: string
  title: string
  type: TaskType
  /** Estimación total en minutos. null = sin estimar. */
  estimatedTotalMinutes: number | null
  /** Tiempo realmente invertido, acumulado entre sesiones. */
  actualMinutesSpent: number
  /** 0-100. Nunca se deriva solo del tiempo invertido. */
  progressPercentage: number
  progressTrackingMode: ProgressMode
  milestones: Milestone[]
  completed: boolean
  completedAt: string | null
  createdAt: string
}

export interface WorkSession {
  id: string
  taskId: string
  goal: string
  startedAt: string
  minutesSpent: number
  progressBefore: number
  progressAfter: number
}

export type MatchKind = 'complete' | 'advance' | 'unsuitable'

export interface Match {
  task: Task
  kind: MatchKind
  /** Minutos recomendados para dedicar ahora. */
  suggestedMinutes: number
  /** Minutos restantes estimados (según progreso, no según tiempo gastado). */
  remainingMinutes: number | null
  /** Objetivo sugerido para la sesión. */
  goal: string
  reason: string
}
