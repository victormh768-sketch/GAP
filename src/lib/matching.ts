import type { Match, Task } from '../types'
import { defaultGoal } from './sessions'
import { effectivePct, remainingMinutes } from './progress'

/** Por debajo de esto, avanzar en una tarea larga no compensa el cambio de contexto. */
export const MIN_USEFUL_SESSION = 10

export function classify(task: Task, available: number): Match | null {
  if (task.completed) return null
  const remaining = remainingMinutes(task)
  const base = { task, remainingMinutes: remaining }

  // 1) Se puede completar en el tiempo disponible.
  if (remaining != null && remaining <= available) {
    return {
      ...base,
      kind: 'complete',
      suggestedMinutes: Math.max(1, remaining),
      goal: `Terminar «${task.title}»`,
      reason: `Te faltan ~${remaining} min y tienes ${available}.`,
    }
  }

  // 2) Tarea larga o por hitos: se puede avanzar y guardar progreso.
  if (task.type !== 'quick' && available >= MIN_USEFUL_SESSION) {
    const left = remaining != null ? ` Quedan ~${remaining} min en total.` : ''
    return {
      ...base,
      kind: 'advance',
      suggestedMinutes: available,
      goal: defaultGoal(task, available),
      reason: `Dedica ${available} min y guarda el progreso.${left}`,
    }
  }

  // 3) No adecuada para este hueco.
  const why =
    task.type === 'quick'
      ? remaining == null
        ? 'No tiene estimación de tiempo.'
        : `Necesita ~${remaining} min y solo tienes ${available}.`
      : `Con menos de ${MIN_USEFUL_SESSION} min no compensa avanzar.`
  return { ...base, kind: 'unsuitable', suggestedMinutes: 0, goal: '', reason: why }
}

export interface Recommendations {
  complete: Match[]
  advance: Match[]
  unsuitable: Match[]
}

export function recommend(tasks: Task[], available: number): Recommendations {
  if (!Number.isFinite(available) || available < 1) {
    return { complete: [], advance: [], unsuitable: [] }
  }
  const matches = tasks.map((t) => classify(t, available)).filter((m): m is Match => m !== null)
  return {
    // Primero las que mejor aprovechan el hueco.
    complete: matches.filter((m) => m.kind === 'complete').sort((a, b) => b.suggestedMinutes - a.suggestedMinutes),
    // Primero las más avanzadas: acercan una tarea al cierre.
    advance: matches
      .filter((m) => m.kind === 'advance')
      .sort((a, b) => effectivePct(b.task) - effectivePct(a.task)),
    unsuitable: matches.filter((m) => m.kind === 'unsuitable'),
  }
}
