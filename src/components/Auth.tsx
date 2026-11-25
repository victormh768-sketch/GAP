import { useState } from 'react'
import { supabase } from '../data/supabase'

export function Auth({ onLocal }: { onLocal: () => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [msg, setMsg] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!supabase) return
    const { error } =
      mode === 'in'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password })
    setMsg(error ? error.message : mode === 'up' ? 'Revisa tu correo para confirmar la cuenta.' : null)
  }

  return (
    <form onSubmit={submit} className="mx-auto mt-24 w-full max-w-sm space-y-4 rounded-3xl border border-line bg-panel p-7">
      <h1 className="text-2xl font-semibold tracking-tight">GAP</h1>
      <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Correo" className="w-full rounded-xl border border-line bg-ink px-3 py-2.5" />
      <input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Contraseña (mín. 8)" className="w-full rounded-xl border border-line bg-ink px-3 py-2.5" />
      {msg && <p role="alert" className="text-sm text-rose-300">{msg}</p>}
      <button className="w-full rounded-xl bg-white py-2.5 text-sm font-semibold text-black">{mode === 'in' ? 'Entrar' : 'Crear cuenta'}</button>
      <div className="flex justify-between text-xs text-muted">
        <button type="button" onClick={() => setMode(mode === 'in' ? 'up' : 'in')}>{mode === 'in' ? 'Crear cuenta' : 'Ya tengo cuenta'}</button>
        <button type="button" onClick={onLocal}>Usar sin cuenta (solo este dispositivo)</button>
      </div>
    </form>
  )
}
