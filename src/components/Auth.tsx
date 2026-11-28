import { useState } from 'react'
import { Contours } from './Contours'
import { supabase } from '../data/supabase'
import { friendlyAuthError } from '../lib/errors'

export function Auth({ onLocal }: { onLocal: () => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!supabase || busy) return
    setBusy(true)
    setMsg(null)
    try {
      const { error } =
        mode === 'in'
          ? await supabase.auth.signInWithPassword({ email, password })
          : await supabase.auth.signUp({ email, password })
      if (error) setMsg({ text: friendlyAuthError(error.message), ok: false })
      else if (mode === 'up') setMsg({ text: 'Revisa tu correo para confirmar la cuenta.', ok: true })
    } catch (err) {
      setMsg({ text: friendlyAuthError(err instanceof Error ? err.message : ''), ok: false })
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto w-full max-w-sm px-5 pt-20">
      <Contours />
      <form onSubmit={submit} className="space-y-4 rounded-[2rem] border border-line bg-panel/90 p-6">
        <h1 className="flex items-center gap-3 font-mono text-lg font-semibold tracking-[0.35em]">
          <span aria-hidden className="glow inline-block h-2.5 w-7 rounded-full bg-accent" />
          GAP
        </h1>
        <p className="text-sm text-muted">{mode === 'in' ? 'Entra para sincronizar tus tareas.' : 'Crea una cuenta para sincronizar tus tareas.'}</p>
        <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Correo" placeholder="Correo" className="min-h-12 w-full rounded-2xl border border-line bg-ink px-4" />
        <input type="password" required minLength={8} autoComplete={mode === 'in' ? 'current-password' : 'new-password'} value={password} onChange={(e) => setPassword(e.target.value)} aria-label="Contraseña" placeholder="Contraseña (mínimo 8)" className="min-h-12 w-full rounded-2xl border border-line bg-ink px-4" />
        {msg && (
          <p role="alert" className={`text-sm ${msg.ok ? 'text-accent' : 'text-danger'}`}>
            {msg.text}
          </p>
        )}
        <button disabled={busy} className="kicker min-h-12 w-full rounded-full bg-accent text-xs font-bold text-ink shadow-[0_0_30px_-6px_rgb(182_243_107/0.55)]">
          {busy ? 'Un momento…' : mode === 'in' ? 'Entrar' : 'Crear cuenta'}
        </button>
        <div className="flex flex-col gap-1 text-sm text-muted">
          <button type="button" onClick={() => setMode(mode === 'in' ? 'up' : 'in')} className="min-h-11 text-left hover:text-white">
            {mode === 'in' ? 'Crear una cuenta' : 'Ya tengo cuenta'}
          </button>
          <button type="button" onClick={onLocal} className="min-h-11 text-left hover:text-white">
            Usar sin cuenta (los datos quedan solo en este dispositivo)
          </button>
        </div>
      </form>
    </main>
  )
}
