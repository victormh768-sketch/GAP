import { useCallback, useEffect, useState } from 'react'
import type { Repository } from '../data/repository'
import { friendlyError } from '../lib/errors'
import { newTask } from '../lib/progress'
import type { FinishResult } from '../lib/sessions'
import type { Task, TaskType, WorkSession } from '../types'

export const newId = () => crypto.randomUUID()

export interface NewTaskInput {
  title: string
  type: TaskType
  estimatedTotalMinutes?: number | null
  milestoneTitles?: string[]
}

export function useGap(repo: Repository) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [sessions, setSessions] = useState<WorkSession[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const reload = useCallback(async () => {
    try {
      const snap = await repo.load()
      setTasks(snap.tasks)
      setSessions(snap.sessions)
      return true
    } catch (e) {
      setError(friendlyError(e, 'load'))
      return false
    } finally {
      setLoading(false)
    }
  }, [repo])

  // El espacio de trabajo se vuelve a montar (key) al cambiar de usuario,
  // así que `loading` ya empieza en true para cada repositorio.
  useEffect(() => {
    void reload()
  }, [reload])

  /**
   * Ejecuta un guardado. Devuelve null si fue bien, o el mensaje de error.
   * Si falla, se recarga el estado real y el mensaje se muestra DESPUÉS de recargar
   * (si no, la recarga lo borraba y el usuario no veía que no se guardó).
   */
  const guard = useCallback(
    async (fn: () => Promise<void>): Promise<string | null> => {
      try {
        await fn()
        setError(null)
        return null
      } catch (e) {
        const message = friendlyError(e, 'save')
        await reload()
        setError(message)
        return message
      }
    },
    [reload],
  )

  const addTask = useCallback(
    (input: NewTaskInput) => {
      const task = newTask(input, newId(), new Date().toISOString(), () => newId())
      setTasks((prev) => [task, ...prev])
      return guard(() => repo.saveTask(task))
    },
    [guard, repo],
  )

  const updateTask = useCallback(
    (task: Task) => {
      setTasks((prev) => prev.map((t) => (t.id === task.id ? task : t)))
      return guard(() => repo.saveTask(task))
    },
    [guard, repo],
  )

  const removeTask = useCallback(
    (id: string) => {
      setTasks((prev) => prev.filter((t) => t.id !== id))
      setSessions((prev) => prev.filter((s) => s.taskId !== id))
      return guard(() => repo.deleteTask(id))
    },
    [guard, repo],
  )

  const finish = useCallback(
    async ({ task, session }: FinishResult): Promise<string | null> => {
      setTasks((prev) => prev.map((t) => (t.id === task.id ? task : t)))
      setSessions((prev) => [session, ...prev])
      return guard(async () => {
        const saved = await repo.recordSession(task, session)
        setTasks((prev) => prev.map((t) => (t.id === saved.id ? saved : t)))
      })
    },
    [guard, repo],
  )

  const clearError = useCallback(() => setError(null), [])

  return { tasks, sessions, loading, error, clearError, addTask, updateTask, removeTask, finish }
}
