import type { Milestone, ProgressMode, Task, TaskType } from '../types'

/** Limita a entero 0-100. Valores no numéricos se tratan como 0. */
export function clampPct(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.min(100, Math.max(0, Math.round(n)))
}

export function milestonePct(milestones: Milestone[]): number {
  if (milestones.length === 0) return 0
  const done = milestones.filter((m) => m.done).length
  return clampPct((done / milestones.length) * 100)
}

/**
 * Progreso real de la tarea. NUNCA se calcula a partir del tiempo invertido:
 * o es el valor manual, o sale de los hitos completados.
 */
export function effectivePct(task: Task): number {
  if (task.completed) return 100
  if (task.progressTrackingMode === 'milestones' && task.milestones.length > 0) {
    return milestonePct(task.milestones)
  }
  return clampPct(task.progressPercentage)
}

/** Minutos restantes estimados según estimación total y progreso. null si no se puede. */
export function remainingMinutes(task: Task): number | null {
  if (task.estimatedTotalMinutes == null || task.estimatedTotalMinutes <= 0) return null
  const pct = effectivePct(task)
  return Math.max(0, Math.round((task.estimatedTotalMinutes * (100 - pct)) / 100))
}

/** Aplica el progreso efectivo y mantiene coherente el estado de completada. */
function normalize(task: Task, now: string): Task {
  const pct = effectivePct({ ...task, completed: false })
  const completed = pct >= 100
  return {
    ...task,
    progressPercentage: pct,
    completed,
    completedAt: completed ? (task.completedAt ?? now) : null,
  }
}

export const MAX_ESTIMATE = 100000

/** Una rápida sin estimación nunca podría recomendarse, así que se exige. */
function validateEstimate(est: number | null, type: TaskType) {
  if (est == null) {
    if (type === 'quick') {
      throw new Error('Indica cuántos minutos necesitas: así GAP sabrá cuándo recomendártela.')
    }
    return
  }
  if (!Number.isFinite(est) || est < 1) throw new Error('La estimación debe ser de al menos 1 minuto.')
  if (est > MAX_ESTIMATE) throw new Error('La estimación es demasiado grande.')
}

export function newTask(
  input: {
    title: string
    type: TaskType
    estimatedTotalMinutes?: number | null
    milestoneTitles?: string[]
  },
  id: string,
  now: string,
  makeId: (index: number) => string = (i) => `${id}-m${i + 1}`,
): Task {
  const title = input.title.trim()
  if (!title) throw new Error('El título es obligatorio')
  const est = input.estimatedTotalMinutes ?? null
  validateEstimate(est, input.type)
  const titles = (input.milestoneTitles ?? []).map((t) => t.trim()).filter(Boolean)
  const mode: ProgressMode = input.type === 'milestones' ? 'milestones' : 'manual'
  return {
    id,
    title,
    type: input.type,
    estimatedTotalMinutes: est == null ? null : Math.round(est),
    actualMinutesSpent: 0,
    progressPercentage: 0,
    progressTrackingMode: mode,
    milestones: titles.map((t, i) => ({
      id: makeId(i),
      title: t,
      done: false,
      position: i,
      completedAt: null,
    })),
    completed: false,
    completedAt: null,
    createdAt: now,
  }
}

/** Actualización manual. Solo válida en modo manual. Tope 0-100. */
export function setManualProgress(task: Task, pct: number, now: string): Task {
  if (task.progressTrackingMode !== 'manual') {
    throw new Error('Esta tarea calcula su progreso por hitos')
  }
  if (!Number.isFinite(pct)) throw new Error('Porcentaje no válido')
  return normalize({ ...task, progressPercentage: clampPct(pct), completed: false, completedAt: null }, now)
}

export function toggleMilestone(task: Task, milestoneId: string, now: string): Task {
  if (!task.milestones.some((m) => m.id === milestoneId)) {
    throw new Error('Hito no encontrado')
  }
  const milestones = task.milestones.map((m) =>
    m.id === milestoneId
      ? { ...m, done: !m.done, completedAt: !m.done ? now : null }
      : m,
  )
  return normalize({ ...task, milestones, completed: false, completedAt: null }, now)
}

export function addMilestone(task: Task, title: string, id: string): Task {
  const t = title.trim()
  if (!t) throw new Error('El hito necesita un título')
  const milestone: Milestone = {
    id,
    title: t,
    done: false,
    position: task.milestones.length,
    completedAt: null,
  }
  return {
    ...task,
    milestones: [...task.milestones, milestone],
    // Añadir un hito pendiente a una tarea terminada la reabre en modo hitos.
    completed: task.progressTrackingMode === 'milestones' ? false : task.completed,
    completedAt: task.progressTrackingMode === 'milestones' ? null : task.completedAt,
  }
}

export function setTrackingMode(task: Task, mode: ProgressMode, now: string): Task {
  if (mode === 'milestones' && task.milestones.length === 0) {
    throw new Error('Añade al menos un hito para calcular el progreso por hitos')
  }
  return normalize({ ...task, progressTrackingMode: mode, completed: false, completedAt: null }, now)
}

export function nextMilestone(task: Task): Milestone | null {
  return task.milestones.filter((m) => !m.done).sort((a, b) => a.position - b.position)[0] ?? null
}

export interface TaskEdit {
  title: string
  type: TaskType
  estimatedTotalMinutes: number | null
}

/** Edita título, tipo y estimación sin tocar progreso, tiempo ni hitos. */
export function editTask(task: Task, edit: TaskEdit, now: string): Task {
  const title = edit.title.trim()
  if (!title) throw new Error('El título es obligatorio.')
  if (title.length > 200) throw new Error('El título es demasiado largo (máximo 200 caracteres).')
  const est = edit.estimatedTotalMinutes
  validateEstimate(est, edit.type)
  if (edit.type === 'milestones' && task.milestones.length === 0) {
    throw new Error('Añade al menos un hito antes de usar el tipo «Por hitos».')
  }
  return normalize(
    {
      ...task,
      title,
      type: edit.type,
      estimatedTotalMinutes: est == null ? null : Math.round(est),
      // normalize recalcula el estado; conservamos el actual para no reabrir ni cerrar nada.
      progressPercentage: effectivePct(task),
      completed: false,
      completedAt: null,
    },
    now,
  )
}

/** Marca la tarea como terminada: 100% manual o todos los hitos hechos. */
export function markDone(task: Task, now: string): Task {
  if (task.progressTrackingMode === 'milestones' && task.milestones.length > 0) {
    const milestones = task.milestones.map((m) => (m.done ? m : { ...m, done: true, completedAt: now }))
    return normalize({ ...task, milestones, completed: false, completedAt: null }, now)
  }
  return normalize({ ...task, progressPercentage: 100, completed: false, completedAt: null }, now)
}

/** Quita un hito. Si era el último en modo hitos, pasa a manual conservando el % actual. */
export function removeMilestone(task: Task, milestoneId: string, now: string): Task {
  if (!task.milestones.some((m) => m.id === milestoneId)) throw new Error('Hito no encontrado')
  const before = effectivePct(task)
  const milestones = task.milestones
    .filter((m) => m.id !== milestoneId)
    .map((m, i) => ({ ...m, position: i }))
  if (milestones.length === 0) {
    const manual: Task = {
      ...task,
      milestones,
      progressTrackingMode: 'manual',
      progressPercentage: before,
      completed: false,
      completedAt: null,
    }
    return normalize(manual, now)
  }
  return normalize({ ...task, milestones, completed: false, completedAt: null }, now)
}
