import { useState } from 'react'
import type { NewTaskInput } from '../hooks/useGap'
import type { TaskType } from '../types'

const TYPES: { value: TaskType; label: string; hint: string }[] = [
  { value: 'quick', label: 'Rápida', hint: 'Se termina en una sesión' },
  { value: 'long', label: 'Larga', hint: 'Varias sesiones' },
  { value: 'milestones', label: 'Por hitos', hint: 'Pequeños pasos' },
]

export function TaskForm({ onCreate }: { onCreate: (input: NewTaskInput) => Promise<void> }) {
  const [title, setTitle] = useState('')
  const [type, setType] = useState<TaskType>('quick')
  const [minutes, setMinutes] = useState('')
  const [milestones, setMilestones] = useState('')
  const [err, setErr] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    try {
      const est = minutes.trim() === '' ? null : Number(minutes)
      const titles = milestones.split('\n')
      if (type === 'milestones' && titles.every((t) => !t.trim())) {
        throw new Error('Añade al menos un hito (uno por línea)')
      }
      await onCreate({ title, type, estimatedTotalMinutes: est, milestoneTitles: type === 'milestones' ? titles : [] })
      setTitle('')
      setMinutes('')
      setMilestones('')
      setErr(null)
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'No se pudo crear la tarea')
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-2xl border border-line bg-panel p-5">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="¿Qué quieres hacer?"
        maxLength={200}
        className="w-full bg-transparent text-lg font-medium placeholder:text-muted/70 focus:outline-none"
      />
      <div role="radiogroup" aria-label="Tipo de tarea" className="grid grid-cols-3 gap-2">
        {TYPES.map((t) => (
          <button
            key={t.value}
            type="button"
            role="radio"
            aria-checked={type === t.value}
            onClick={() => setType(t.value)}
            className={`rounded-xl border px-3 py-2 text-left transition ${
              type === t.value ? 'border-accent/60 bg-accent/10' : 'border-line hover:border-white/20'
            }`}
          >
            <div className="text-sm font-medium">{t.label}</div>
            <div className="text-[11px] leading-tight text-muted">{t.hint}</div>
          </button>
        ))}
      </div>
      <label className="flex items-center gap-3 text-sm text-muted">
        Tiempo total estimado
        <input
          type="number"
          min={1}
          inputMode="numeric"
          value={minutes}
          onChange={(e) => setMinutes(e.target.value)}
          placeholder="min"
          className="w-24 rounded-lg border border-line bg-ink px-3 py-1.5 text-white"
        />
      </label>
      {type === 'milestones' && (
        <textarea
          value={milestones}
          onChange={(e) => setMilestones(e.target.value)}
          rows={4}
          placeholder={'Un hito por línea\nEsquema\nBorrador\nRevisión'}
          className="w-full resize-none rounded-xl border border-line bg-ink p-3 text-sm placeholder:text-muted/70"
        />
      )}
      {err && <p role="alert" className="text-sm text-rose-300">{err}</p>}
      <button
        type="submit"
        className="w-full rounded-xl bg-white py-2.5 text-sm font-semibold text-black transition hover:bg-white/90 active:scale-[0.99]"
      >
        Añadir tarea
      </button>
    </form>
  )
}
