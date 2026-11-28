import { useId } from 'react'
import type { Plan } from '../lib/matching'

const TAU = Math.PI * 2

function Defs({ id }: { id: string }) {
  return (
    <defs>
      <linearGradient id={`${id}-g`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#b6f36b" />
        <stop offset="1" stopColor="#e2f98a" />
      </linearGradient>
      {/* Rayado para «avanzar»: se distingue del bloque sólido sin depender del color. */}
      <pattern id={`${id}-h`} width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="3.5" height="7" fill="#b6f36b" />
      </pattern>
    </defs>
  )
}

function Ticks({ size, count, majorEvery }: { size: number; count: number; majorEvery: number }) {
  const c = size / 2
  return (
    <g stroke="#a3ac9d" strokeLinecap="round">
      {Array.from({ length: count }, (_, i) => {
        const a = (i / count) * TAU - Math.PI / 2
        const major = i % majorEvery === 0
        const r1 = c - 6
        const r2 = r1 - (major ? 9 : 4)
        return (
          <line
            key={i}
            x1={c + r1 * Math.cos(a)}
            y1={c + r1 * Math.sin(a)}
            x2={c + r2 * Math.cos(a)}
            y2={c + r2 * Math.sin(a)}
            strokeWidth={major ? 1.6 : 1}
            opacity={major ? 0.5 : 0.18}
          />
        )
      })}
    </g>
  )
}

/** Anillo de «Mi hueco»: cada tarea del plan ocupa un tramo proporcional a sus minutos. */
export function GapRing({
  plan,
  available,
  children,
}: {
  plan: Plan | undefined
  available: number | null
  children: React.ReactNode
}) {
  const id = useId().replace(/:/g, '')
  const size = 220
  const c = size / 2
  const r = 80
  const circ = TAU * r
  const GAP_PX = 5

  const items = plan && available ? plan.items : []
  const segments = items.map((item, i) => {
    const before = items.slice(0, i).reduce((sum, it) => sum + it.minutes, 0)
    const len = (item.minutes / (available as number)) * circ
    return { key: item.task.id, kind: item.kind, len: Math.max(2, len - GAP_PX), offset: (before / (available as number)) * circ }
  })

  return (
    <div className="relative mx-auto grid place-items-center" style={{ width: size, height: size }}>
      <div aria-hidden className="absolute inset-4 rounded-full bg-accent/10 blur-2xl" />
      <svg viewBox={`0 0 ${size} ${size}`} className="absolute inset-0" aria-hidden focusable="false">
        <Defs id={id} />
        <Ticks size={size} count={24} majorEvery={6} />
        <circle cx={c} cy={c} r={r} fill="none" stroke="#ffffff" strokeOpacity="0.07" strokeWidth="14" />
        <g className="glow" transform={`rotate(-90 ${c} ${c})`}>
          {segments.map((s) => (
            <circle
              key={s.key}
              cx={c}
              cy={c}
              r={r}
              fill="none"
              stroke={s.kind === 'complete' ? `url(#${id}-g)` : `url(#${id}-h)`}
              strokeWidth="14"
              strokeDasharray={`${s.len} ${circ}`}
              strokeDashoffset={-s.offset}
            />
          ))}
        </g>
      </svg>
      <div className="relative z-10 grid place-items-center">{children}</div>
    </div>
  )
}

/** Anillo del temporizador: arco de progreso con marcas y cabeza luminosa. */
export function TimerRing({
  progress,
  size = 288,
  children,
}: {
  progress: number
  size?: number
  children: React.ReactNode
}) {
  const id = useId().replace(/:/g, '')
  const c = size / 2
  const r = c - 30
  const circ = TAU * r
  const p = Math.min(1, Math.max(0, progress))
  const head = p * TAU - Math.PI / 2

  return (
    <div className="relative mx-auto grid aspect-square place-items-center" style={{ width: `min(${size}px, 100%)` }}>
      <div aria-hidden className="absolute inset-8 rounded-full bg-accent/10 blur-3xl" />
      <svg viewBox={`0 0 ${size} ${size}`} className="absolute inset-0" aria-hidden focusable="false">
        <Defs id={id} />
        <Ticks size={size} count={60} majorEvery={5} />
        <circle cx={c} cy={c} r={r} fill="none" stroke="#ffffff" strokeOpacity="0.07" strokeWidth="12" />
        {p > 0 && (
          <g className="glow">
            <circle
              cx={c}
              cy={c}
              r={r}
              fill="none"
              stroke={`url(#${id}-g)`}
              strokeWidth="12"
              strokeLinecap="round"
              strokeDasharray={`${circ * p} ${circ}`}
              transform={`rotate(-90 ${c} ${c})`}
            />
            <circle cx={c + r * Math.cos(head)} cy={c + r * Math.sin(head)} r="6" fill="#e2f98a" />
          </g>
        )}
      </svg>
      <div className="relative z-10 grid place-items-center text-center">{children}</div>
    </div>
  )
}
