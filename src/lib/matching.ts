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
        ? 'Falta indicar cuánto tarda: edítala en Tareas para que GAP pueda recomendarla.'
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

// ───────────────────────── Combinaciones para «Mi hueco» ─────────────────────────

export interface PlanItem {
  task: Task
  kind: 'complete' | 'advance'
  /** Minutos que se recomienda dedicar en este hueco. */
  minutes: number
  goal: string
  /** Por qué se recomienda, en una frase. */
  reason: string
}

export interface Plan {
  id: 'close' | 'focus' | 'split'
  label: string
  items: PlanItem[]
  usedMinutes: number
  freeMinutes: number
  completes: number
  advances: number
}

export const MAX_PLAN_MINUTES = 720

/** Subconjunto con máx. nº de tareas y, a igualdad, máx. minutos usados (mochila 0/1). */
function bestCompleteSubset(items: Match[], capacity: number): Match[] {
  const BIG = 100000 // > cualquier suma de minutos: el nº de tareas manda sobre los minutos
  const w = items.map((m) => Math.max(1, m.suggestedMinutes))
  const n = items.length
  const dp: number[] = new Array(capacity + 1).fill(0)
  const take: boolean[][] = Array.from({ length: n }, () => new Array<boolean>(capacity + 1).fill(false))
  for (let i = 0; i < n; i++) {
    for (let c = capacity; c >= w[i]; c--) {
      const candidate = dp[c - w[i]] + BIG + w[i]
      if (candidate > dp[c]) {
        dp[c] = candidate
        take[i][c] = true
      }
    }
  }
  const chosen: Match[] = []
  let c = capacity
  for (let i = n - 1; i >= 0; i--) {
    if (take[i][c]) {
      chosen.push(items[i])
      c -= w[i]
    }
  }
  return chosen.sort((a, b) => a.suggestedMinutes - b.suggestedMinutes)
}

function completeItem(m: Match): PlanItem {
  const minutes = Math.max(1, m.suggestedMinutes)
  return {
    task: m.task,
    kind: 'complete',
    minutes,
    goal: `Terminar «${m.task.title}»`,
    reason: `Te faltan ~${minutes} min: cabe entera en tu hueco.`,
  }
}

function advanceItem(m: Match, minutes: number): PlanItem {
  const left = m.remainingMinutes
  return {
    task: m.task,
    kind: 'advance',
    minutes,
    goal: defaultGoal(m.task, minutes),
    reason:
      left != null
        ? `Dedicas ${minutes} min de ~${left} que quedan; el progreso se guarda.`
        : `Dedicas ${minutes} min y guardas el progreso.`,
  }
}

function makePlan(id: Plan['id'], label: string, items: PlanItem[], available: number): Plan {
  const used = items.reduce((a, i) => a + i.minutes, 0)
  return {
    id,
    label,
    items,
    usedMinutes: used,
    freeMinutes: Math.max(0, available - used),
    completes: items.filter((i) => i.kind === 'complete').length,
    advances: items.filter((i) => i.kind === 'advance').length,
  }
}

/**
 * Hasta tres formas distintas de aprovechar el hueco, de la más recomendable a la menos:
 *  - «Cerrar tareas»: completa cuantas pueda y usa el sobrante para avanzar una larga.
 *  - «Un solo foco»: todo el tiempo en una tarea larga.
 *  - «Repartir»: dos tareas largas a partes casi iguales.
 * Las tareas completadas nunca aparecen y ningún plan supera el tiempo disponible.
 */
export function planGap(tasks: Task[], available: number): Plan[] {
  if (!Number.isFinite(available) || available < 1) return []
  const avail = Math.min(MAX_PLAN_MINUTES, Math.floor(available))
  const matches = tasks.map((t) => classify(t, avail)).filter((m): m is Match => m !== null)
  const completes = matches.filter((m) => m.kind === 'complete')
  const advances = matches
    .filter((m) => m.kind === 'advance')
    .sort((a, b) => effectivePct(b.task) - effectivePct(a.task))

  const plans: Plan[] = []

  const chosen = bestCompleteSubset(completes, avail)
  if (chosen.length > 0) {
    const items = chosen.map(completeItem)
    const free = avail - items.reduce((a, i) => a + i.minutes, 0)
    if (free >= MIN_USEFUL_SESSION && advances.length > 0) items.push(advanceItem(advances[0], free))
    plans.push(makePlan('close', 'Cerrar tareas', items, avail))
  }

  if (advances.length > 0) {
    plans.push(makePlan('focus', 'Un solo foco', [advanceItem(advances[0], avail)], avail))
  }

  if (advances.length >= 2 && avail >= 2 * MIN_USEFUL_SESSION) {
    const first = Math.ceil(avail / 2)
    plans.push(
      makePlan('split', 'Repartir', [advanceItem(advances[0], first), advanceItem(advances[1], avail - first)], avail),
    )
  }

  // Sin duplicados (p. ej. «Cerrar» con solo una larga equivale a «Un solo foco»).
  const seen = new Set<string>()
  return plans.filter((p) => {
    const key = p.items.map((i) => `${i.task.id}:${i.minutes}:${i.kind}`).join('|')
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
