import { useState } from 'react'
import { newId } from '../hooks/useGap'
import { friendlyError } from '../lib/errors'
import {
  addMilestone,
  editTask,
  effectivePct,
  markDone,
  remainingMinutes,
  removeMilestone,
  setManualProgress,
  setTrackingMode,
  toggleMilestone,
} from '../lib/progress'
import { formatMinutes } from '../lib/stats'
import type { Task, TaskType } from '../types'
import { ProgressBar } from './ProgressBar'

const TYPE_LABEL: Record<TaskType, string> = { quick: 'Rápida', long: 'Larga', milestones: 'Por hitos' }

function EditForm({ task, onSave }: { task: Task; onSave: (title: string, type: TaskType, est: number | null) => void }) {
  const [title, setTitle] = useState(task.title)
  const [type, setType] = useState<TaskType>(task.type)
  const [est, setEst] = useState(task.estimatedTotalMinutes == null ? '' : String(task.estimatedTotalMinutes))
  const dirty = title !== task.title || type !== task.type || est !== (task.estimatedTotalMinutes == null ? '' : String(task.estimatedTotalMinutes))

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onSave(title, type, est.trim() === '' ? null : Number(est))
      }}
      className="space-y-3"
    >
      <p className="text-xs font-medium uppercase tracking-widest text-muted">Editar</p>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={200}
        aria-label="Nombre de la tarea"
        className="min-h-11 w-full rounded-xl border border-line bg-ink px-3"
      />
      <div className="flex flex-wrap gap-2">
        <label className="flex items-center gap-2 text-sm text-muted">
          Tipo
          <select
            value={type}
            onChange={(e) => setType(e.target.value as TaskType)}
            className="min-h-11 rounded-xl border border-line bg-ink px-2 text-white"
          >
            {(Object.keys(TYPE_LABEL) as TaskType[]).map((t) => (
              <option key={t} value={t}>
                {TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm text-muted">
          Total
          <input
            type="number"
            min={1}
            inputMode="numeric"
            value={est}
            onChange={(e) => setEst(e.target.value)}
            placeholder="min"
            className="min-h-11 w-24 rounded-xl border border-line bg-ink px-3 text-white"
          />
        </label>
      </div>
      <button disabled={!dirty} className="min-h-11 rounded-xl border border-line px-4 text-sm font-semibold hover:border-accent/60">
        Guardar cambios
      </button>
    </form>
  )
}

export function TaskCard({
  task,
  onChange,
  onDelete,
  onWork,
  workDisabled,
  open,
  onToggle,
}: {
  task: Task
  onChange: (t: Task) => void
  onDelete: () => void
  onWork: () => void
  /** Hay otra sesión en curso: no se puede empezar una nueva. */
  workDisabled: boolean
  /** El estado abierto vive en el padre: la tarjeta se remonta al cambiar de sección. */
  open: boolean
  onToggle: () => void
}) {
  const [newMs, setNewMs] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const pct = effectivePct(task)
  const left = remainingMinutes(task)
  const now = () => new Date().toISOString()

  function run(fn: () => Task) {
    try {
      onChange(fn())
      setErr(null)
    } catch (e) {
      setErr(friendlyError(e))
    }
  }

  function changeMode(mode: 'manual' | 'milestones') {
    if (mode === task.progressTrackingMode) return
    try {
      const next = setTrackingMode(task, mode, now())
      const to = effectivePct(next)
      if (to < pct && !window.confirm(`Al cambiar a «${mode === 'manual' ? 'Manual' : 'Por hitos'}» el progreso pasará de ${pct}% a ${to}%. ¿Continuar?`)) {
        return
      }
      onChange(next)
      setErr(null)
    } catch (e) {
      setErr(friendlyError(e))
    }
  }

  return (
    <article className="rounded-2xl border border-line bg-panel p-4 transition hover:border-white/15 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className={`break-words text-base font-semibold leading-snug ${task.completed ? 'text-muted line-through' : ''}`}>
            {task.title}
          </h3>
          <span className="mt-1.5 inline-block rounded-full border border-line px-2.5 py-0.5 text-[11px] text-muted">
            {TYPE_LABEL[task.type]}
          </span>
        </div>
        {!task.completed && (
          <button
            onClick={onWork}
            disabled={workDisabled}
            title={workDisabled ? 'Termina o descarta la sesión en curso primero' : undefined}
            className="min-h-11 shrink-0 rounded-full bg-accent px-5 text-sm font-semibold text-ink transition hover:brightness-110 active:scale-95"
          >
            Trabajar
          </button>
        )}
      </div>

      <div className="mt-4 space-y-2">
        <ProgressBar value={pct} label={`Progreso de ${task.title}`} />
        <div className="flex flex-wrap justify-between gap-x-4 gap-y-0.5 text-xs text-muted">
          <span className="font-semibold text-white">{pct}% completado</span>
          <span>
            {formatMinutes(task.actualMinutesSpent)} invertidos
            {task.estimatedTotalMinutes != null && ` · ${formatMinutes(task.estimatedTotalMinutes)} estimados`}
            {left != null && !task.completed && ` · ~${formatMinutes(left)} restantes`}
          </span>
        </div>
      </div>

      <button
        onClick={onToggle}
        aria-expanded={open}
        className="-mb-2 mt-1 min-h-11 text-sm text-muted transition hover:text-white"
      >
        {open ? 'Ocultar detalle' : 'Detalle y progreso'}
      </button>

      {open && (
        <div className="mt-2 space-y-5 border-t border-line pt-4">
          {task.milestones.length > 0 && (
            <ul className="space-y-0.5">
              {task.milestones.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-2">
                  <label className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-3 text-sm">
                    <input
                      type="checkbox"
                      checked={m.done}
                      onChange={() => run(() => toggleMilestone(task, m.id, now()))}
                      className="size-5 shrink-0 accent-[var(--color-accent)]"
                    />
                    <span className={`break-words ${m.done ? 'text-muted line-through' : ''}`}>{m.title}</span>
                  </label>
                  <button
                    onClick={() => run(() => removeMilestone(task, m.id, now()))}
                    aria-label={`Quitar el hito «${m.title}»`}
                    className="grid size-11 shrink-0 place-items-center rounded-full text-lg text-muted hover:text-danger"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault()
              run(() => addMilestone(task, newMs, newId()))
              setNewMs('')
            }}
            className="flex gap-2"
          >
            <input
              value={newMs}
              onChange={(e) => setNewMs(e.target.value)}
              maxLength={200}
              aria-label="Nuevo hito"
              placeholder="Nuevo hito"
              className="min-h-11 min-w-0 flex-1 rounded-xl border border-line bg-ink px-3"
            />
            <button disabled={!newMs.trim()} className="min-h-11 rounded-xl border border-line px-4 text-sm hover:border-accent/60">
              Añadir
            </button>
          </form>

          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-3 text-sm text-muted">
              <span>Cálculo del progreso</span>
              <div className="flex rounded-xl border border-line p-0.5" role="group" aria-label="Modo de progreso">
                {(['manual', 'milestones'] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => changeMode(m)}
                    aria-pressed={task.progressTrackingMode === m}
                    className={`min-h-10 rounded-lg px-3 ${task.progressTrackingMode === m ? 'bg-accent font-semibold text-ink' : ''}`}
                  >
                    {m === 'manual' ? 'Manual' : 'Por hitos'}
                  </button>
                ))}
              </div>
            </div>
            {task.progressTrackingMode === 'manual' ? (
              <label className="flex items-center gap-3 text-sm">
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={pct}
                  aria-label="Porcentaje completado"
                  onChange={(e) => run(() => setManualProgress(task, Number(e.target.value), now()))}
                  className="h-8 flex-1"
                />
                <span className="w-11 text-right tabular-nums">{pct}%</span>
              </label>
            ) : (
              <p className="text-xs text-muted">El porcentaje se calcula con los hitos completados.</p>
            )}
          </div>

          <EditForm
            key={`${task.title}|${task.type}|${task.estimatedTotalMinutes}`}
            task={task}
            onSave={(title, type, est) => run(() => editTask(task, { title, type, estimatedTotalMinutes: est }, now()))}
          />

          {err && <p role="alert" className="text-sm text-danger">{err}</p>}

          <div className="flex flex-wrap items-center justify-between gap-2">
            {!task.completed ? (
              <button
                onClick={() => run(() => markDone(task, now()))}
                className="min-h-11 rounded-xl border border-line px-4 text-sm font-semibold hover:border-accent/60"
              >
                Marcar como hecha
              </button>
            ) : (
              <span className="text-xs text-muted">Terminada. Baja el progreso o desmarca un hito para reabrirla.</span>
            )}
            <button
              onClick={() => window.confirm(`¿Eliminar «${task.title}» y todo su historial?`) && onDelete()}
              className="min-h-11 px-2 text-sm text-danger/80 hover:text-danger"
            >
              Eliminar
            </button>
          </div>
        </div>
      )}
    </article>
  )
}
