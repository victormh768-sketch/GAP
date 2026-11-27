import { describe, expect, it } from 'vitest'
import { sanitizeTask } from '../data/repository'
import { friendlyAuthError, friendlyError } from './errors'
import { MIN_USEFUL_SESSION, planGap } from './matching'
import {
  editTask,
  effectivePct,
  markDone,
  newTask,
  removeMilestone,
  setManualProgress,
  toggleMilestone,
} from './progress'
import { finishSession, parseActiveSession, startSession } from './sessions'

const NOW = '2026-11-25T08:00:00.000Z'
const T0 = Date.parse(NOW)
const MIN = 60_000

const quick = (id: string, min: number) => newTask({ title: `Rápida ${id}`, type: 'quick', estimatedTotalMinutes: min }, id, NOW)
const long = (id: string, est = 90, pct = 0) => {
  const t = newTask({ title: `Larga ${id}`, type: 'long', estimatedTotalMinutes: est }, id, NOW)
  return pct ? setManualProgress(t, pct, NOW) : t
}
const withMilestones = () =>
  newTask({ title: 'Informe', type: 'milestones', estimatedTotalMinutes: 120, milestoneTitles: ['A', 'B', 'C'] }, 'm', NOW)

describe('planGap · combinaciones para el hueco', () => {
  it('sin tiempo o con tiempo no válido no hay plan', () => {
    for (const n of [0, -5, NaN]) expect(planGap([quick('a', 10)], n)).toEqual([])
  })

  it('sin tareas no hay plan', () => {
    expect(planGap([], 30)).toEqual([])
  })

  it('cierra el máximo número de tareas y usa el sobrante para avanzar una larga', () => {
    const plans = planGap([quick('a', 10), quick('b', 15), quick('c', 20), long('l')], 45)
    const close = plans.find((p) => p.id === 'close')!
    // 10 + 15 + 20 = 45 cabe justo → 3 tareas completadas, nada de sobrante
    expect(close.completes).toBe(3)
    expect(close.usedMinutes).toBe(45)
    expect(close.freeMinutes).toBe(0)
  })

  it('prefiere más tareas completadas aunque use menos minutos', () => {
    // Opciones con 30 min: {25} (1 tarea) frente a {10,10,10} (3 tareas)
    const plans = planGap([quick('a', 25), quick('b', 10), quick('c', 10), quick('d', 10)], 30)
    const close = plans[0]
    expect(close.id).toBe('close')
    expect(close.completes).toBe(3)
    expect(close.items.map((i) => i.task.id).sort()).toEqual(['b', 'c', 'd'])
  })

  it('a igualdad de número de tareas, aprovecha más minutos', () => {
    const plans = planGap([quick('a', 5), quick('b', 20), quick('c', 18)], 25)
    expect(plans[0].items.map((i) => i.task.id).sort()).toEqual(['a', 'b'])
    expect(plans[0].usedMinutes).toBe(25)
  })

  it('usa el sobrante en avanzar una tarea larga si es útil', () => {
    const plans = planGap([quick('a', 10), long('l')], 30)
    const close = plans.find((p) => p.id === 'close')!
    expect(close.items.map((i) => `${i.kind}:${i.minutes}`)).toEqual(['complete:10', 'advance:20'])
    expect(close.usedMinutes).toBe(30)
  })

  it('no rellena con avance si el sobrante es menor al mínimo útil', () => {
    const plans = planGap([quick('a', 25), long('l')], 30) // sobran 5 < 10
    const close = plans.find((p) => p.id === 'close')!
    expect(MIN_USEFUL_SESSION).toBeGreaterThan(5)
    expect(close.advances).toBe(0)
    expect(close.freeMinutes).toBe(5)
  })

  it('ejemplo del enunciado: 20 min y tarea de 90 → avanzar 20 min', () => {
    const plans = planGap([long('p', 90)], 20)
    expect(plans).toHaveLength(1)
    expect(plans[0].items[0]).toMatchObject({ kind: 'advance', minutes: 20 })
    expect(plans[0].items[0].reason).toContain('90')
  })

  it('nunca supera el tiempo disponible, en ningún plan ni hueco', () => {
    const tasks = [quick('a', 7), quick('b', 13), quick('c', 22), long('l1'), long('l2', 200, 40), long('l3', 60)]
    for (let avail = 1; avail <= 180; avail++) {
      for (const p of planGap(tasks, avail)) {
        expect(p.usedMinutes).toBeLessThanOrEqual(avail)
        expect(p.usedMinutes + p.freeMinutes).toBe(avail)
        expect(p.items.every((i) => i.minutes >= 1)).toBe(true)
      }
    }
  })

  it('una misma tarea no aparece dos veces en un plan', () => {
    const tasks = [quick('a', 10), long('l1'), long('l2')]
    for (const p of planGap(tasks, 50)) {
      const ids = p.items.map((i) => i.task.id)
      expect(new Set(ids).size).toBe(ids.length)
    }
  })

  it('ofrece «Un solo foco» y «Repartir» con varias tareas largas', () => {
    const plans = planGap([long('l1'), long('l2'), long('l3')], 40)
    expect(plans.map((p) => p.id)).toEqual(['focus', 'split'])
    const split = plans[1]
    expect(split.items.map((i) => i.minutes)).toEqual([20, 20])
  })

  it('no ofrece «Repartir» si cada parte quedaría por debajo del mínimo útil', () => {
    const plans = planGap([long('l1'), long('l2')], 15)
    expect(plans.map((p) => p.id)).toEqual(['focus'])
  })

  it('elimina planes duplicados', () => {
    // Solo una larga: «Cerrar» no existe y «Un solo foco» es el único plan.
    expect(planGap([long('l1')], 30).map((p) => p.id)).toEqual(['focus'])
  })

  it('excluye tareas terminadas', () => {
    const done = setManualProgress(long('d'), 100, NOW)
    const plans = planGap([done, quick('a', 10)], 30)
    const ids = plans.flatMap((p) => p.items.map((i) => i.task.id))
    expect(ids).not.toContain('d')
    expect(ids).toContain('a')
  })

  it('con huecos muy pequeños solo sugiere lo que cabe', () => {
    expect(planGap([long('l1'), quick('a', 20)], 5)).toEqual([])
    expect(planGap([long('l1'), quick('a', 4)], 5)[0].items[0].task.id).toBe('a')
  })

  it('una tarea larga casi terminada se propone para completar', () => {
    const plans = planGap([long('l', 100, 90)], 20) // quedan 10 min
    expect(plans[0].items[0]).toMatchObject({ kind: 'complete', minutes: 10 })
  })

  it('acepta huecos grandes sin romperse', () => {
    const many = Array.from({ length: 60 }, (_, i) => quick(`t${i}`, 5 + (i % 17)))
    const plans = planGap(many, 720)
    expect(plans[0].usedMinutes).toBeLessThanOrEqual(720)
    expect(planGap(many, 99999)[0].usedMinutes).toBeLessThanOrEqual(720)
  })
})

describe('crear y editar tareas', () => {
  it('una rápida exige estimación', () => {
    expect(() => newTask({ title: 'x', type: 'quick' }, 'q', NOW)).toThrow(/minutos/)
  })
  it('una larga puede no tener estimación', () => {
    expect(newTask({ title: 'x', type: 'long' }, 'q', NOW).estimatedTotalMinutes).toBeNull()
  })
  it('edita título, tipo y estimación sin perder progreso, tiempo ni hitos', () => {
    let t = { ...setManualProgress(long('l'), 40, NOW), actualMinutesSpent: 35 }
    t = editTask(t, { title: '  Nuevo nombre ', type: 'long', estimatedTotalMinutes: 120 }, NOW)
    expect(t.title).toBe('Nuevo nombre')
    expect(t.estimatedTotalMinutes).toBe(120)
    expect(t.progressPercentage).toBe(40)
    expect(t.actualMinutesSpent).toBe(35)
  })
  it('editar no reabre ni cierra una tarea terminada', () => {
    const done = setManualProgress(long('l'), 100, NOW)
    const edited = editTask(done, { title: 'x', type: 'long', estimatedTotalMinutes: 50 }, NOW)
    expect(edited.completed).toBe(true)
    expect(edited.progressPercentage).toBe(100)
  })
  it('valida título, estimación y tipo', () => {
    const t = long('l')
    expect(() => editTask(t, { title: '   ', type: 'long', estimatedTotalMinutes: 10 }, NOW)).toThrow(/título/)
    expect(() => editTask(t, { title: 'x', type: 'long', estimatedTotalMinutes: 0 }, NOW)).toThrow()
    expect(() => editTask(t, { title: 'x', type: 'quick', estimatedTotalMinutes: null }, NOW)).toThrow(/minutos/)
    expect(() => editTask(t, { title: 'x', type: 'milestones', estimatedTotalMinutes: 10 }, NOW)).toThrow(/hito/)
    expect(() => editTask(t, { title: 'x'.repeat(201), type: 'long', estimatedTotalMinutes: 10 }, NOW)).toThrow()
  })
  it('permite añadir estimación a una rápida antigua que no la tenía', () => {
    const legacy = sanitizeTask({ id: 'o', title: 'Antigua', createdAt: NOW })
    const fixed = editTask(legacy, { title: 'Antigua', type: 'quick', estimatedTotalMinutes: 15 }, NOW)
    expect(planGap([fixed], 20)[0].items[0].kind).toBe('complete')
  })
})

describe('marcar como hecha y quitar hitos', () => {
  it('markDone en modo manual pone 100% y la completa', () => {
    const t = markDone(long('l'), NOW)
    expect(t.completed).toBe(true)
    expect(effectivePct(t)).toBe(100)
  })
  it('markDone en modo hitos marca todos los hitos', () => {
    const t = markDone(withMilestones(), NOW)
    expect(t.milestones.every((m) => m.done)).toBe(true)
    expect(t.completed).toBe(true)
  })
  it('quitar un hito recalcula el porcentaje y reindexa posiciones', () => {
    let t = toggleMilestone(withMilestones(), 'm-m1', NOW) // 1/3
    t = removeMilestone(t, 'm-m3', NOW) // 1/2
    expect(effectivePct(t)).toBe(50)
    expect(t.milestones.map((m) => m.position)).toEqual([0, 1])
  })
  it('quitar el único hito pendiente completa la tarea', () => {
    let t = toggleMilestone(toggleMilestone(withMilestones(), 'm-m1', NOW), 'm-m2', NOW)
    t = removeMilestone(t, 'm-m3', NOW)
    expect(t.completed).toBe(true)
  })
  it('quitar el último hito pasa a manual y conserva el porcentaje', () => {
    let t = newTask({ title: 'x', type: 'milestones', milestoneTitles: ['solo'] }, 'z', NOW)
    t = removeMilestone(t, 'z-m1', NOW)
    expect(t.progressTrackingMode).toBe('manual')
    expect(t.milestones).toHaveLength(0)
    expect(effectivePct(t)).toBe(0)
  })
  it('quitar un hito inexistente falla con mensaje', () => {
    expect(() => removeMilestone(withMilestones(), 'nope', NOW)).toThrow()
  })
})

describe('sesiones · casos nuevos', () => {
  it('rechaza una sesión sin tiempo ni avance', () => {
    const t = long('l')
    const s = startSession(t, { now: T0 })
    expect(() => finishSession(t, s, { now: T0 + 10_000 }, 'x')).toThrow(/no tiene tiempo ni avance/)
  })
  it('acepta una sesión corta si cambia el progreso', () => {
    const t = long('l')
    const s = startSession(t, { now: T0 })
    const r = finishSession(t, s, { now: T0 + 10_000, progressPct: 10 }, 'x')
    expect(r.session.minutesSpent).toBe(0)
    expect(r.task.progressPercentage).toBe(10)
  })
  it('«terminada» cierra la tarea aunque no haya minutos', () => {
    const t = quick('q', 10)
    const s = startSession(t, { now: T0, intent: 'complete', targetMinutes: 10 })
    const r = finishSession(t, s, { now: T0 + MIN, markDone: true }, 'x')
    expect(r.task.completed).toBe(true)
    expect(r.session.progressAfter).toBe(100)
  })
  it('«terminada» en tarea por hitos marca todos los hitos', () => {
    const t = withMilestones()
    const s = startSession(t, { now: T0 })
    const r = finishSession(t, s, { now: T0 + 5 * MIN, markDone: true }, 'x')
    expect(r.task.milestones.every((m) => m.done)).toBe(true)
    expect(r.task.actualMinutesSpent).toBe(5)
  })
  it('guarda el objetivo de minutos y la intención', () => {
    const s = startSession(long('l'), { now: T0, targetMinutes: 20, intent: 'advance' })
    expect(s).toMatchObject({ targetMinutes: 20, intent: 'advance' })
  })
  it('parseActiveSession acepta sesiones antiguas y rechaza datos dañados', () => {
    const old = { taskId: 'a', goal: 'g', startedAt: NOW, timerEnabled: true, accumulatedMs: 0, resumedAt: null }
    expect(parseActiveSession(old)).toMatchObject({ taskId: 'a' })
    expect(parseActiveSession({ ...old, accumulatedMs: -5 })).toBeNull()
    expect(parseActiveSession({ ...old, taskId: 4 })).toBeNull()
    expect(parseActiveSession(null)).toBeNull()
    expect(parseActiveSession('texto')).toBeNull()
  })
})

describe('mensajes de error comprensibles', () => {
  it('almacenamiento lleno', () => {
    const e = new DOMException('quota', 'QuotaExceededError')
    expect(friendlyError(e)).toMatch(/almacenamiento/)
  })
  it('sin conexión', () => {
    expect(friendlyError(new TypeError('Failed to fetch'))).toMatch(/sin conexión/)
  })
  it('permisos / sesión caducada', () => {
    expect(friendlyError(new Error('new row violates row-level security policy'))).toMatch(/sesión/)
  })
  it('conserva validaciones redactadas para el usuario y oculta errores técnicos', () => {
    expect(friendlyError(new Error('El título es obligatorio.'))).toBe('El título es obligatorio.')
    expect(friendlyError(new Error('PGRST301: {"code":"x"}'))).toMatch(/Inténtalo de nuevo/)
    expect(friendlyError(undefined)).toMatch(/Inténtalo de nuevo/)
  })
  it('errores de autenticación en español', () => {
    expect(friendlyAuthError('Invalid login credentials')).toMatch(/incorrectos/)
    expect(friendlyAuthError('weird')).toMatch(/Inténtalo/)
  })
})
