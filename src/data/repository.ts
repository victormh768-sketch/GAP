import type { Milestone, ProgressMode, Task, TaskType, WorkSession } from '../types'
import { clampPct } from '../lib/progress'

export interface Snapshot {
  tasks: Task[]
  sessions: WorkSession[]
}

export interface Repository {
  load(): Promise<Snapshot>
  saveTask(task: Task): Promise<void>
  deleteTask(id: string): Promise<void>
  /** Guarda la sesión y devuelve la tarea tal como queda persistida. */
  recordSession(task: Task, session: WorkSession): Promise<Task>
}

const TYPES: TaskType[] = ['quick', 'long', 'milestones']
const MODES: ProgressMode[] = ['manual', 'milestones']

/**
 * Normaliza cualquier tarea guardada, incluidas las anteriores a Smart Progress
 * (sin los campos nuevos). Nunca descarta datos: solo rellena valores por defecto.
 */
export function sanitizeTask(raw: Record<string, unknown>): Task {
  const type = TYPES.includes(raw.type as TaskType) ? (raw.type as TaskType) : 'quick'
  const mode = MODES.includes(raw.progressTrackingMode as ProgressMode)
    ? (raw.progressTrackingMode as ProgressMode)
    : 'manual'
  const legacyEstimate = typeof raw.estimatedMinutes === 'number' ? raw.estimatedMinutes : null
  const est =
    typeof raw.estimatedTotalMinutes === 'number' ? raw.estimatedTotalMinutes : legacyEstimate
  const completed = raw.completed === true
  const milestones = Array.isArray(raw.milestones) ? (raw.milestones as Milestone[]) : []
  const pct =
    typeof raw.progressPercentage === 'number' ? clampPct(raw.progressPercentage) : completed ? 100 : 0
  return {
    id: String(raw.id),
    title: String(raw.title ?? ''),
    type,
    estimatedTotalMinutes: est != null && est > 0 ? Math.round(est) : null,
    actualMinutesSpent:
      typeof raw.actualMinutesSpent === 'number' && raw.actualMinutesSpent > 0
        ? Math.round(raw.actualMinutesSpent)
        : 0,
    progressPercentage: pct,
    progressTrackingMode: mode === 'milestones' && milestones.length === 0 ? 'manual' : mode,
    milestones,
    completed,
    completedAt: typeof raw.completedAt === 'string' ? raw.completedAt : null,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : new Date(0).toISOString(),
  }
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

export class LocalRepository implements Repository {
  private storage: StorageLike
  private key: string

  constructor(storage: StorageLike = globalThis.localStorage, key = 'gap:v1') {
    this.storage = storage
    this.key = key
  }

  private read(): Snapshot {
    try {
      const parsed = JSON.parse(this.storage.getItem(this.key) ?? 'null') as {
        tasks?: Record<string, unknown>[]
        sessions?: WorkSession[]
      } | null
      return {
        tasks: (parsed?.tasks ?? []).map(sanitizeTask),
        sessions: parsed?.sessions ?? [],
      }
    } catch {
      return { tasks: [], sessions: [] }
    }
  }

  private write(s: Snapshot) {
    this.storage.setItem(this.key, JSON.stringify(s))
  }

  async load() {
    return this.read()
  }

  async saveTask(task: Task) {
    const s = this.read()
    const i = s.tasks.findIndex((t) => t.id === task.id)
    if (i >= 0) s.tasks[i] = task
    else s.tasks.unshift(task)
    this.write(s)
  }

  async deleteTask(id: string) {
    const s = this.read()
    this.write({
      tasks: s.tasks.filter((t) => t.id !== id),
      sessions: s.sessions.filter((x) => x.taskId !== id),
    })
  }

  async recordSession(task: Task, session: WorkSession) {
    const s = this.read()
    const i = s.tasks.findIndex((t) => t.id === task.id)
    if (i >= 0) s.tasks[i] = task
    else s.tasks.unshift(task)
    s.sessions.unshift(session)
    this.write(s)
    return task
  }
}
