import { useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Auth } from './components/Auth'
import { GapMatcher } from './components/GapMatcher'
import { SessionPanel } from './components/SessionPanel'
import { StatsView } from './components/StatsView'
import { TaskCard } from './components/TaskCard'
import { TaskForm } from './components/TaskForm'
import { LocalRepository, type Repository } from './data/repository'
import { SupabaseRepository, supabase } from './data/supabase'
import { useGap } from './hooks/useGap'
import { defaultGoal, type ActiveSession } from './lib/sessions'
import { isInProgress } from './lib/stats'

type Tab = 'tasks' | 'gap' | 'stats'
const TABS: { id: Tab; label: string }[] = [
  { id: 'tasks', label: 'Tareas' },
  { id: 'gap', label: 'Mi hueco' },
  { id: 'stats', label: 'Estadísticas' },
]
const ACTIVE_KEY = 'gap:active-session'

function loadActive(): ActiveSession | null {
  try {
    return JSON.parse(localStorage.getItem(ACTIVE_KEY) ?? 'null') as ActiveSession | null
  } catch {
    return null
  }
}

function Workspace({ repo }: { repo: Repository }) {
  const store = useGap(repo)
  const [tab, setTab] = useState<Tab>('tasks')
  const [active, setActiveState] = useState<ActiveSession | null>(loadActive)
  const [starting, setStarting] = useState<{ taskId: string; goal: string } | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  function setActive(s: ActiveSession | null) {
    setActiveState(s)
    try {
      if (s) localStorage.setItem(ACTIVE_KEY, JSON.stringify(s))
      else localStorage.removeItem(ACTIVE_KEY)
    } catch {
      /* almacenamiento no disponible: la sesión sigue en memoria */
    }
  }

  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(null), 2800)
    return () => clearTimeout(id)
  }, [toast])

  const panelTaskId = active?.taskId ?? starting?.taskId
  const panelTask = store.tasks.find((t) => t.id === panelTaskId)

  const pending = useMemo(() => store.tasks.filter((t) => !t.completed), [store.tasks])
  const done = useMemo(() => store.tasks.filter((t) => t.completed), [store.tasks])
  const inProgress = pending.filter(isInProgress)
  const untouched = pending.filter((t) => !isInProgress(t))

  const card = (t: (typeof store.tasks)[number]) => (
    <TaskCard
      key={t.id}
      task={t}
      onChange={(u) => void store.updateTask(u)}
      onDelete={() => void store.removeTask(t.id)}
      onWork={() => setStarting({ taskId: t.id, goal: defaultGoal(t) })}
    />
  )

  return (
    <div className="mx-auto w-full max-w-2xl px-5 pb-24 pt-8">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">GAP</h1>
        {supabase && (
          <button onClick={() => void supabase!.auth.signOut()} className="text-xs text-muted hover:text-white">
            Salir
          </button>
        )}
      </header>

      <nav className="mb-6 grid grid-cols-3 rounded-2xl border border-line bg-panel p-1" aria-label="Secciones">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            aria-current={tab === t.id ? 'page' : undefined}
            className={`rounded-xl py-2 text-sm transition ${tab === t.id ? 'bg-white/10 font-medium text-white' : 'text-muted hover:text-white'}`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {store.error && <p role="alert" className="mb-4 rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-2 text-sm text-rose-200">{store.error}</p>}
      {store.loading ? (
        <p className="py-16 text-center text-sm text-muted">Cargando…</p>
      ) : (
        <>
          {tab === 'tasks' && (
            <div className="space-y-8">
              <TaskForm onCreate={store.addTask} />
              {inProgress.length > 0 && (
                <section className="space-y-3">
                  <h2 className="text-xs uppercase tracking-widest text-muted">En progreso</h2>
                  {inProgress.map(card)}
                </section>
              )}
              {untouched.length > 0 && (
                <section className="space-y-3">
                  <h2 className="text-xs uppercase tracking-widest text-muted">Pendientes</h2>
                  {untouched.map(card)}
                </section>
              )}
              {done.length > 0 && (
                <section className="space-y-3">
                  <h2 className="text-xs uppercase tracking-widest text-muted">Terminadas</h2>
                  {done.map(card)}
                </section>
              )}
              {store.tasks.length === 0 && <p className="py-6 text-center text-sm text-muted">Aún no tienes tareas.</p>}
            </div>
          )}
          {tab === 'gap' && <GapMatcher tasks={store.tasks} onStart={(task, goal) => setStarting({ taskId: task.id, goal })} />}
          {tab === 'stats' && <StatsView tasks={store.tasks} sessions={store.sessions} />}
        </>
      )}

      {panelTask && (
        <SessionPanel
          key={panelTask.id}
          task={panelTask}
          initialGoal={starting?.goal ?? defaultGoal(panelTask)}
          active={active}
          setActive={setActive}
          onClose={() => setStarting(null)}
          onFinish={(result) => {
            void store.finish(result)
            setActive(null)
            setStarting(null)
            setToast(result.task.completed ? '¡Tarea terminada!' : `Progreso guardado · ${result.task.progressPercentage}%`)
          }}
        />
      )}
      {toast && (
        <div role="status" className="fixed bottom-6 left-1/2 z-30 -translate-x-1/2 rounded-full border border-line bg-raised px-5 py-2 text-sm shadow-xl">
          {toast}
        </div>
      )}
    </div>
  )
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(!supabase)
  const [local, setLocal] = useState(false)

  useEffect(() => {
    if (!supabase) return
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setReady(true)
    })
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  const repo = useMemo(
    () => (supabase && session ? new SupabaseRepository(supabase) : new LocalRepository()),
    [session],
  )

  if (!ready) return null
  if (supabase && !session && !local) return <Auth onLocal={() => setLocal(true)} />
  return <Workspace key={session?.user.id ?? 'local'} repo={repo} />
}
