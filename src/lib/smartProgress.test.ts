import { describe, expect, it } from 'vitest'
import { LocalRepository, sanitizeTask } from '../data/repository'
import { recommend } from './matching'
import {
  addMilestone,
  effectivePct,
  newTask,
  remainingMinutes,
  setManualProgress,
  setTrackingMode,
  toggleMilestone,
} from './progress'
import { elapsedMs, finishSession, pauseSession, resumeSession, startSession } from './sessions'
import { computeStats } from './stats'

const NOW = '2026-11-24T10:00:00.000Z'
const T0 = Date.parse(NOW)
const MIN = 60_000

const longTask = (over: Record<string, unknown> = {}) => ({
  ...newTask({ title: 'Preparar presentación', type: 'long', estimatedTotalMinutes: 90 }, 'a', NOW),
  ...over,
})
const milestoneTask = () =>
  newTask(
    { title: 'Informe', type: 'milestones', estimatedTotalMinutes: 120, milestoneTitles: ['Esquema', 'Borrador', 'Revisión', 'Entrega'] },
    'm',
    NOW,
  )

function memoryStorage() {
  const data = new Map<string, string>()
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  }
}

describe('actualización manual del porcentaje', () => {
  it('guarda el valor indicado', () => {
    expect(setManualProgress(longTask(), 40, NOW).progressPercentage).toBe(40)
  })
  it('no se calcula solo por el tiempo invertido', () => {
    const t = longTask({ actualMinutesSpent: 500 })
    expect(effectivePct(t)).toBe(0)
  })
  it('rechaza el modo manual en tareas por hitos', () => {
    expect(() => setManualProgress(milestoneTask(), 50, NOW)).toThrow()
  })
  it('permite bajar el porcentaje de una tarea terminada y la reabre', () => {
    const done = setManualProgress(longTask(), 100, NOW)
    expect(done.completed).toBe(true)
    const reopened = setManualProgress(done, 80, NOW)
    expect(reopened.completed).toBe(false)
    expect(reopened.progressPercentage).toBe(80)
  })
})

describe('cálculo por hitos', () => {
  it('calcula el porcentaje con los hitos completados', () => {
    let t = milestoneTask()
    t = toggleMilestone(t, 'm-m1', NOW)
    expect(effectivePct(t)).toBe(25)
    t = toggleMilestone(t, 'm-m2', NOW)
    expect(effectivePct(t)).toBe(50)
  })
  it('completa la tarea al terminar todos los hitos', () => {
    let t = milestoneTask()
    for (const m of t.milestones) t = toggleMilestone(t, m.id, NOW)
    expect(t.completed).toBe(true)
    expect(effectivePct(t)).toBe(100)
  })
  it('desmarcar un hito reabre la tarea', () => {
    let t = milestoneTask()
    for (const m of t.milestones) t = toggleMilestone(t, m.id, NOW)
    t = toggleMilestone(t, 'm-m4', NOW)
    expect(t.completed).toBe(false)
    expect(effectivePct(t)).toBe(75)
  })
  it('añadir un hito a una tarea terminada por hitos la reabre', () => {
    let t = milestoneTask()
    for (const m of t.milestones) t = toggleMilestone(t, m.id, NOW)
    t = addMilestone(t, 'Presentar', 'm-m5')
    expect(t.completed).toBe(false)
    expect(effectivePct(t)).toBe(80)
  })
  it('exige hitos para activar el modo por hitos', () => {
    expect(() => setTrackingMode(longTask(), 'milestones', NOW)).toThrow()
  })
})

describe('sin porcentajes superiores al 100%', () => {
  it('limita el valor manual', () => {
    expect(setManualProgress(longTask(), 250, NOW).progressPercentage).toBe(100)
    expect(setManualProgress(longTask(), -30, NOW).progressPercentage).toBe(0)
  })
  it('limita datos corruptos al cargarlos', () => {
    expect(sanitizeTask({ id: 'x', title: 'a', progressPercentage: 999 }).progressPercentage).toBe(100)
    expect(sanitizeTask({ id: 'x', title: 'a', progressPercentage: -5 }).progressPercentage).toBe(0)
  })
  it('el progreso tras una sesión nunca supera 100', () => {
    const t = longTask()
    const s = startSession(t, { now: T0 })
    const { task, session } = finishSession(t, s, { now: T0 + MIN, progressPct: 400 }, 's1')
    expect(task.progressPercentage).toBe(100)
    expect(session.progressAfter).toBe(100)
  })
  it('el tiempo restante nunca es negativo', () => {
    expect(remainingMinutes(setManualProgress(longTask(), 100, NOW))).toBe(0)
  })
})

describe('acumulación del tiempo entre sesiones', () => {
  it('suma el tiempo sin sobrescribir el anterior', () => {
    let t = longTask()
    const s1 = startSession(t, { now: T0 })
    t = finishSession(t, s1, { now: T0 + 20 * MIN, progressPct: 25 }, 's1').task
    const s2 = startSession(t, { now: T0 + 60 * MIN })
    t = finishSession(t, s2, { now: T0 + 75 * MIN, progressPct: 40 }, 's2').task
    expect(t.actualMinutesSpent).toBe(35)
    expect(t.progressPercentage).toBe(40)
  })
  it('el temporizador respeta las pausas', () => {
    let s = startSession(longTask(), { now: T0 })
    s = pauseSession(s, T0 + 10 * MIN)
    s = resumeSession(s, T0 + 30 * MIN) // 20 min en pausa no cuentan
    expect(elapsedMs(s, T0 + 35 * MIN)).toBe(15 * MIN)
  })
  it('sin temporizador usa los minutos manuales', () => {
    const t = longTask()
    const s = startSession(t, { now: T0, timerEnabled: false })
    expect(finishSession(t, s, { now: T0, manualMinutes: 25 }, 's').task.actualMinutesSpent).toBe(25)
  })
  it('rechaza tiempos negativos y limita a 24 h', () => {
    const t = longTask()
    const s = startSession(t, { now: T0, timerEnabled: false })
    expect(() => finishSession(t, s, { now: T0, manualMinutes: -5 }, 's')).toThrow()
    expect(finishSession(t, s, { now: T0, manualMinutes: 99999 }, 's').session.minutesSpent).toBe(1440)
  })
  it('marca hitos durante la sesión y actualiza el progreso', () => {
    const t = milestoneTask()
    const s = startSession(t, { now: T0 })
    const { task, session } = finishSession(t, s, { now: T0 + 30 * MIN, completedMilestoneIds: ['m-m1', 'm-m2'] }, 's')
    expect(task.progressPercentage).toBe(50)
    expect(session.progressBefore).toBe(0)
    expect(session.progressAfter).toBe(50)
  })
  it('no permite iniciar sesión en una tarea terminada', () => {
    expect(() => startSession(setManualProgress(longTask(), 100, NOW), { now: T0 })).toThrow()
  })
})

describe('persistencia del progreso', () => {
  it('conserva progreso, tiempo, hitos y sesiones entre cargas', async () => {
    const storage = memoryStorage()
    const repo1 = new LocalRepository(storage)
    let t = milestoneTask()
    await repo1.saveTask(t)
    const s = startSession(t, { now: T0 })
    const res = finishSession(t, s, { now: T0 + 20 * MIN, completedMilestoneIds: ['m-m1'] }, 's1')
    t = await repo1.recordSession(res.task, res.session)

    const repo2 = new LocalRepository(storage) // "recarga"
    const { tasks, sessions } = await repo2.load()
    expect(tasks[0].actualMinutesSpent).toBe(20)
    expect(tasks[0].progressPercentage).toBe(25)
    expect(tasks[0].milestones.filter((m) => m.done)).toHaveLength(1)
    expect(sessions).toHaveLength(1)
  })
  it('es compatible con tareas anteriores sin campos de Smart Progress', async () => {
    const storage = memoryStorage()
    storage.setItem(
      'gap:v1',
      JSON.stringify({
        tasks: [
          { id: 'old1', title: 'Tarea antigua', estimatedMinutes: 30, completed: false, createdAt: NOW },
          { id: 'old2', title: 'Hecha', completed: true, createdAt: NOW },
        ],
      }),
    )
    const { tasks } = await new LocalRepository(storage).load()
    expect(tasks[0]).toMatchObject({ type: 'quick', estimatedTotalMinutes: 30, actualMinutesSpent: 0, progressPercentage: 0, progressTrackingMode: 'manual' })
    expect(tasks[1].progressPercentage).toBe(100)
  })
  it('no falla con almacenamiento corrupto', async () => {
    const storage = memoryStorage()
    storage.setItem('gap:v1', '{no es json')
    expect((await new LocalRepository(storage).load()).tasks).toEqual([])
  })
})

describe('recomendaciones de Smart Gap Matching', () => {
  const quick = (id: string, min: number) =>
    newTask({ title: `Rápida ${id}`, type: 'quick', estimatedTotalMinutes: min }, id, NOW)

  it('recomienda avanzar 20 min en una tarea larga de 90 min restantes', () => {
    const r = recommend([longTask()], 20)
    expect(r.advance).toHaveLength(1)
    expect(r.advance[0].suggestedMinutes).toBe(20)
    expect(r.advance[0].remainingMinutes).toBe(90)
  })
  it('distingue completar, avanzar y no adecuada', () => {
    const r = recommend([quick('q1', 15), quick('q2', 60), longTask()], 20)
    expect(r.complete.map((m) => m.task.id)).toEqual(['q1'])
    expect(r.advance.map((m) => m.task.id)).toEqual(['a'])
    expect(r.unsuitable.map((m) => m.task.id)).toEqual(['q2'])
  })
  it('una tarea larga casi terminada se puede completar', () => {
    const t = setManualProgress(longTask(), 90, NOW) // quedan 9 min
    expect(recommend([t], 20).complete).toHaveLength(1)
  })
  it('no recomienda avanzar en tareas largas con huecos demasiado pequeños', () => {
    const r = recommend([longTask()], 5)
    expect(r.advance).toHaveLength(0)
    expect(r.unsuitable).toHaveLength(1)
  })
  it('una tarea rápida sin estimación no es adecuada', () => {
    const t = newTask({ title: 'x', type: 'quick' }, 'q', NOW)
    expect(recommend([t], 30).unsuitable).toHaveLength(1)
  })
  it('sugiere el siguiente hito como objetivo', () => {
    let t = milestoneTask()
    t = toggleMilestone(t, 'm-m1', NOW)
    expect(recommend([t], 30).advance[0].goal).toContain('Borrador')
  })
  it('excluye las tareas completadas', () => {
    const done = setManualProgress(longTask(), 100, NOW)
    const r = recommend([done, quick('q1', 10)], 30)
    const ids = [...r.complete, ...r.advance, ...r.unsuitable].map((m) => m.task.id)
    expect(ids).toEqual(['q1'])
  })
  it('sin tiempo disponible no recomienda nada', () => {
    const r = recommend([longTask()], 0)
    expect(r.complete.length + r.advance.length + r.unsuitable.length).toBe(0)
  })
})

describe('estadísticas', () => {
  it('distingue tiempo, progreso, terminadas y en progreso', () => {
    const a = longTask() // sin tocar
    const b = setManualProgress({ ...longTask({ id: 'b' }), actualMinutesSpent: 30 }, 30, NOW)
    const c = setManualProgress(longTask({ id: 'c' }), 100, NOW)
    const sessions = [
      { id: '1', taskId: 'b', goal: '', startedAt: NOW, minutesSpent: 30, progressBefore: 0, progressAfter: 30 },
      { id: '2', taskId: 'c', goal: '', startedAt: NOW, minutesSpent: 10, progressBefore: 80, progressAfter: 100 },
    ]
    const st = computeStats([a, b, c], sessions)
    expect(st.minutesInvested).toBe(40)
    expect(st.progressGained).toBe(50)
    expect(st.tasksCompleted).toBe(1)
    expect(st.tasksInProgress).toBe(1)
    expect(st.averageProgressInProgress).toBe(30)
  })
  it('una tarea con tiempo pero 0% sigue contando como en progreso, no como avance', () => {
    const t = longTask({ actualMinutesSpent: 45 })
    const st = computeStats([t], [])
    expect(st.tasksInProgress).toBe(1)
    expect(st.progressGained).toBe(0)
  })
})
