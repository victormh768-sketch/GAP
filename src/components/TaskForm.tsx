import { useState } from 'react'
import type { NewTaskInput } from '../hooks/useGap'
import { friendlyError } from '../lib/errors'
import type { TaskType } from '../types'

const TYPES: { value: TaskType; label: string; hint: string }[] = [
  { value: 'quick', label: 'Rápida', hint: 'Cabe en un hueco' },
  { value: 'long', label: 'Larga', hint: 'La avanzas por sesiones' },
  { value: 'milestones', label: 'Por hitos', hint: 'Pasos pequeños' },
]
const CHIPS = [5, 15, 30, 60, 120]

export function TaskForm({ onCreate }: { onCreate: (input: NewTaskInput) => Promise<string | null> }) {
  const [title, setTitle] = useState('')
  const [type, setType] = useState<TaskType>('quick')
  const [minutes, setMinutes] = useState('')
  const [milestones, setMilestones] = useState('')
  const [err, setErr] = useState<string | null>(null)

  const quick = type === 'quick'

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    try {
      const est = minutes.trim() === '' ? null : Number(minutes)
      if (type === 'milestones' && milestones.split('\n').every((t) => !t.trim())) {
        throw new Error('Añade al menos un hito (uno por línea).')
      }
      const failure = await onCreate({
        title,
        type,
        estimatedTotalMinutes: est,
        milestoneTitles: type === 'milestones' ? milestones.split('\n') : [],
      })
      if (failure) {
        setErr(failure)
        return
      }
      setTitle('')
      setMinutes('')
      setMilestones('')
      setErr(null)
    } catch (e2) {
      setErr(friendlyError(e2))
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-[1.75rem] border border-line bg-panel/90 p-5" aria-label="Nueva tarea">
      <input
        id="nueva-tarea"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="¿Qué quieres hacer?"
        aria-label="Nombre de la tarea"
        maxLength={200}
        autoComplete="off"
        className="min-h-12 w-full bg-transparent text-lg font-semibold placeholder:text-muted/70 focus:outline-none"
      />

      <div role="radiogroup" aria-label="Tipo de tarea" className="grid grid-cols-3 gap-2">
        {TYPES.map((t) => (
          <button
            key={t.value}
            type="button"
            role="radio"
            aria-checked={type === t.value}
            onClick={() => setType(t.value)}
            className={`min-h-14 rounded-2xl border px-2.5 py-2 text-left transition ${
              type === t.value ? 'border-accent bg-accent/10' : 'border-line hover:border-white/25'
            }`}
          >
            <div className={`kicker whitespace-nowrap text-[10px] font-bold tracking-[0.12em] ${type === t.value ? 'text-accent' : ''}`}>{t.label}</div>
            <div className="text-[11px] leading-tight text-muted">{t.hint}</div>
          </button>
        ))}
      </div>

      <div className="space-y-2">
        <label htmlFor="estimacion" className="kicker block text-muted">
          {quick ? 'Cuánto tardas en total' : 'Tiempo total estimado (opcional)'}
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <input
            id="estimacion"
            type="number"
            min={1}
            inputMode="numeric"
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            placeholder="min"
            className="min-h-11 w-24 rounded-xl border border-line bg-ink px-3"
          />
          {CHIPS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setMinutes(String(c))}
              aria-pressed={minutes === String(c)}
              className={`min-h-11 rounded-full border px-3.5 text-sm ${
                minutes === String(c) ? 'border-accent bg-accent font-semibold text-ink' : 'border-line text-muted hover:text-white'
              }`}
            >
              {c >= 60 ? `${c / 60} h` : `${c} min`}
            </button>
          ))}
        </div>
      </div>

      {type === 'milestones' && (
        <textarea
          value={milestones}
          onChange={(e) => setMilestones(e.target.value)}
          rows={4}
          aria-label="Hitos, uno por línea"
          placeholder={'Un hito por línea\nEsquema\nBorrador\nRevisión'}
          className="w-full resize-none rounded-xl border border-line bg-ink p-3 text-sm placeholder:text-muted/70"
        />
      )}

      {err && <p role="alert" className="text-sm text-danger">{err}</p>}
      <button type="submit" className="kicker min-h-12 w-full rounded-full bg-accent text-xs font-bold text-ink shadow-[0_0_30px_-6px_rgb(182_243_107/0.55)] transition hover:brightness-110 active:scale-[0.99]">
        Añadir tarea
      </button>
    </form>
  )
}
