import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Task, WorkSession } from '../types'
import { effectivePct } from '../lib/progress'
import { sanitizeTask, type Repository, type Snapshot } from './repository'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const supabase: SupabaseClient | null = url && key ? createClient(url, key) : null

type Row = Record<string, unknown>

function fail(error: { message: string } | null) {
  if (error) throw new Error(error.message)
}

function toTask(row: Row, milestones: Row[]): Task {
  return sanitizeTask({
    id: row.id,
    title: row.title,
    type: row.task_type,
    estimatedTotalMinutes: row.estimated_total_minutes ?? row.estimated_minutes,
    actualMinutesSpent: row.actual_minutes_spent,
    progressPercentage: row.progress_percentage,
    progressTrackingMode: row.progress_tracking_mode,
    completed: row.completed,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    milestones: milestones
      .filter((m) => m.task_id === row.id)
      .sort((a, b) => Number(a.position) - Number(b.position))
      .map((m) => ({
        id: String(m.id),
        title: String(m.title),
        done: m.done === true,
        position: Number(m.position),
        completedAt: (m.completed_at as string | null) ?? null,
      })),
  })
}

export class SupabaseRepository implements Repository {
  private db: SupabaseClient

  constructor(db: SupabaseClient) {
    this.db = db
  }

  async load(): Promise<Snapshot> {
    const [t, m, s] = await Promise.all([
      this.db.from('tasks').select('*').order('created_at', { ascending: false }),
      this.db.from('milestones').select('*'),
      this.db.from('work_sessions').select('*').order('started_at', { ascending: false }),
    ])
    fail(t.error)
    fail(m.error)
    fail(s.error)
    return {
      tasks: (t.data ?? []).map((row) => toTask(row, m.data ?? [])),
      sessions: (s.data ?? []).map(
        (r): WorkSession => ({
          id: r.id,
          taskId: r.task_id,
          goal: r.goal,
          startedAt: r.started_at,
          minutesSpent: r.minutes_spent,
          progressBefore: r.progress_before,
          progressAfter: r.progress_after,
        }),
      ),
    }
  }

  private async upsertMilestones(task: Task) {
    if (task.milestones.length === 0) return
    const { error } = await this.db.from('milestones').upsert(
      task.milestones.map((m) => ({
        id: m.id,
        task_id: task.id,
        title: m.title,
        done: m.done,
        position: m.position,
        completed_at: m.completedAt,
      })),
    )
    fail(error)
  }

  async saveTask(task: Task) {
    const { error } = await this.db.from('tasks').upsert({
      id: task.id,
      title: task.title,
      task_type: task.type,
      estimated_total_minutes: task.estimatedTotalMinutes,
      actual_minutes_spent: task.actualMinutesSpent,
      progress_percentage: effectivePct(task),
      progress_tracking_mode: task.progressTrackingMode,
      completed: task.completed,
      completed_at: task.completedAt,
    })
    fail(error)
    await this.upsertMilestones(task)
  }

  async deleteTask(id: string) {
    const { error } = await this.db.from('tasks').delete().eq('id', id)
    fail(error)
  }

  async recordSession(task: Task, session: WorkSession): Promise<Task> {
    // Los hitos primero: la función del servidor calcula el progreso a partir de ellos.
    await this.upsertMilestones(task)
    const { data, error } = await this.db.rpc('finish_work_session', {
      p_task_id: task.id,
      p_goal: session.goal,
      p_started_at: session.startedAt,
      p_minutes: session.minutesSpent,
      p_new_progress: task.progressTrackingMode === 'manual' ? effectivePct(task) : null,
    })
    fail(error)
    return toTask(data as Row, task.milestones.map((m) => ({ ...m, task_id: task.id, completed_at: m.completedAt })))
  }
}
