export function ProgressBar({ value, label }: { value: number; label?: string }) {
  const v = Math.min(100, Math.max(0, value))
  return (
    <div
      role="progressbar"
      aria-label={label ?? 'Progreso'}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={v}
      className="h-1.5 w-full overflow-hidden rounded-full bg-white/10"
    >
      <div className="h-full rounded-full bg-accent transition-[width] duration-500 ease-out" style={{ width: `${v}%` }} />
    </div>
  )
}
