import { useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Auth } from './components/Auth'
import { GapMatcher, type StartIntent } from './components/GapMatcher'
import { SessionPanel } from './components/SessionPanel'
import { StatsView } from './components/StatsView'
import { TaskCard } from './components/TaskCard'
import { TaskForm } from './components/TaskForm'
import { LocalRepository, type Repository } from './data/repository'
import { SupabaseRepository, supabase } from './data/supabase'
import { useGap } from './hooks/useGap'
import { friendlyError } from './lib/errors'
import { defaultGoal, elapsedMs, parseActiveSession, startSession, type ActiveSession } from './lib/sessions'
import { formatClock as clock, isInProgress } from './lib/stats'
import type { Task } from './types'

type Tab = 'gap' | 'tasks' | 'stats'
const ACTIVE_KEY = 'gap:active-session'

function loadActive(): ActiveSession | null {
  try {
    return parseActiveSession(JSON.parse(localStorage.getItem(ACTIVE_KEY) ?? 'null'))
  } catch {
    return null
  }
}

const icon = {
  gap: <path d="M3 12h5m8 0h5M10 12h4" strokeDasharray="0" />,
  tasks: <path d="M5 7h14M5 12h14M5 17h9" />,
  stats: <path d="M5 19V11m7 8V5m7 14v-6" />,
}

function NavIcon({ tab }: { tab: Tab }) {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
      {icon[tab]}
    </svg>
  )
}

const TABS: { id: Tab; label: string }[] = [
  { id: 'gap', label: 'Mi hueco' },
  { id: 'tasks', label: 'Tareas' },
  { id: 'stats', label: 'Estadísticas' },
]

function ActiveBar({ task, active, onOpen }: { task: Task; active: ActiveSession; onOpen: () => void }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (active.resumedAt == null) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [active.resumedAt])
  return (
    <button
      onClick={onOpen}
      className="fixed inset-x-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 mx-auto flex min-h-14 max-w-xl items-center justify-between gap-3 rounded-2xl border border-accent/50 bg-raised px-4 text-left shadow-xl"
    >
      <span className="min-w-0">
        <span className="block text-[11px] font-semibold uppercase tracking-widest text-accent">
          {active.resumedAt == null && active.timerEnabled ? 'Sesión en pausa' : 'Sesión en curso'}
        </span>
        <span className="block truncate text-sm font-medium">{task.title}</span>
      </span>
      <span className="shrink-0 text-lg font-semibold tabular-nums">{active.timerEnabled ? clock(elapsedMs(active, now)) : 'Abrir'}</span>
    </button>
  )
}

function Workspace({ repo }: { repo: Repository }) {
  const store = useGap(repo)
  const [tab, setTab] = useState<Tab>('gap')
  const [savedActive, setActiveState] = useState<ActiveSession | null>(loadActive)
  const [panelOpen, setPanelOpen] = useState(true)
  const [starting, setStarting] = useState<{ taskId: string; goal: string } | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [openIds, setOpenIds] = useState<ReadonlySet<string>>(new Set())

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
    const id = setTimeout(() => setToast(null), 3200)
    return () => clearTimeout(id)
  }, [toast])

  // La tarea de una sesión guardada pudo borrarse o no ser de este usuario: entonces se ignora.
  const active =
    savedActive && (store.loading || store.tasks.some((t) => t.id === savedActive.taskId)) ? savedActive : null

  const panelTask = store.tasks.find((t) => t.id === (active?.taskId ?? starting?.taskId))
  const showPanel = !!panelTask && (active ? panelOpen : true)
  const activeTask = active ? store.tasks.find((t) => t.id === active.taskId) : undefined

  function start(task: Task, goal: string, minutes?: number, intent?: StartIntent) {
    if (active) {
      setPanelOpen(true)
      return
    }
    if (minutes === undefined) {
      setStarting({ taskId: task.id, goal })
      return
    }
    try {
      // Un solo clic: la sesión arranca ya, con temporizador y el tiempo recomendado como objetivo.
      setActive(startSession(task, { goal, targetMinutes: minutes, intent, now: Date.now() }))
      setStarting(null)
      setPanelOpen(true)
    } catch (e) {
      setToast(friendlyError(e))
    }
  }

  function goAdd() {
    setTab('tasks')
    setTimeout(() => document.getElementById('nueva-tarea')?.focus(), 60)
  }

  const pending = useMemo(() => store.tasks.filter((t) => !t.completed), [store.tasks])
  const done = useMemo(() => store.tasks.filter((t) => t.completed), [store.tasks])
  const inProgress = pending.filter(isInProgress)
  const untouched = pending.filter((t) => !isInProgress(t))

  const card = (t: Task) => (
    <TaskCard
      key={t.id}
      task={t}
      workDisabled={active !== null}
      open={openIds.has(t.id)}
      onToggle={() =>
        setOpenIds((prev) => {
          const next = new Set(prev)
          if (!next.delete(t.id)) next.add(t.id)
          return next
        })
      }
      onChange={(u) => void store.updateTask(u)}
      onDelete={() => void store.removeTask(t.id)}
      onWork={() => start(t, defaultGoal(t))}
    />
  )

  const barVisible = !!active && !!activeTask && !showPanel

  return (
    <div className={`mx-auto w-full max-w-xl px-4 pt-6 sm:px-5 ${barVisible ? 'pb-44' : 'pb-28'}`}>
      <header className="mb-6 flex items-center justify-between">
        <h1 className="flex items-center gap-2.5 text-xl font-bold tracking-tight">
          <span aria-hidden className="inline-block h-2.5 w-6 rounded-full bg-accent" />
          GAP
        </h1>
        {supabase && (
          <button onClick={() => void supabase!.auth.signOut()} className="min-h-11 px-2 text-sm text-muted hover:text-white">
            Salir
          </button>
        )}
      </header>

      {store.error && (
        <div role="alert" className="mb-5 flex items-start justify-between gap-3 rounded-2xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm">
          <p>{store.error}</p>
          <button onClick={store.clearError} className="shrink-0 font-semibold underline underline-offset-2">
            Cerrar
          </button>
        </div>
      )}

      <main>
        {store.loading ? (
          <p className="py-20 text-center text-sm text-muted">Cargando…</p>
        ) : (
          <>
            {tab === 'gap' && (
              <GapMatcher
                tasks={store.tasks}
                activeSessionTitle={activeTask?.title ?? null}
                onOpenSession={() => setPanelOpen(true)}
                onStart={(task, goal, minutes, intent) => start(task, goal, minutes, intent)}
                onAddTask={goAdd}
              />
            )}
            {tab === 'tasks' && (
              <div className="space-y-8">
                <TaskForm onCreate={store.addTask} />
                {store.tasks.length === 0 && (
                  <p className="px-2 text-center text-sm leading-relaxed text-muted">
                    Empieza con una tarea y los minutos que necesita. Luego ve a «Mi hueco» y GAP te dirá qué hacer con el tiempo que tengas.
                  </p>
                )}
                {inProgress.length > 0 && (
                  <section className="space-y-3">
                    <h2 className="text-xs font-medium uppercase tracking-widest text-muted">En progreso</h2>
                    {inProgress.map(card)}
                  </section>
                )}
                {untouched.length > 0 && (
                  <section className="space-y-3">
                    <h2 className="text-xs font-medium uppercase tracking-widest text-muted">Pendientes</h2>
                    {untouched.map(card)}
                  </section>
                )}
                {done.length > 0 && (
                  <section className="space-y-3">
                    <h2 className="text-xs font-medium uppercase tracking-widest text-muted">Terminadas</h2>
                    {done.map(card)}
                  </section>
                )}
                {!supabase && (
                  <p className="text-center text-xs text-muted">Tus datos se guardan solo en este dispositivo y navegador.</p>
                )}
              </div>
            )}
            {tab === 'stats' && <StatsView tasks={store.tasks} sessions={store.sessions} onGoToGap={() => setTab('gap')} />}
          </>
        )}
      </main>

      {barVisible && <ActiveBar task={activeTask} active={active} onOpen={() => setPanelOpen(true)} />}

      <nav
        aria-label="Secciones"
        className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-ink/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
      >
        <div className="mx-auto grid max-w-xl grid-cols-3">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              aria-current={tab === t.id ? 'page' : undefined}
              className={`flex min-h-16 flex-col items-center justify-center gap-1 text-xs transition ${
                tab === t.id ? 'font-semibold text-accent' : 'text-muted hover:text-white'
              }`}
            >
              <NavIcon tab={t.id} />
              {t.label}
            </button>
          ))}
        </div>
      </nav>

      {showPanel && panelTask && (
        <SessionPanel
          key={panelTask.id}
          task={panelTask}
          initialGoal={starting?.goal ?? defaultGoal(panelTask)}
          active={active}
          setActive={setActive}
          onClose={() => setStarting(null)}
          onMinimize={() => setPanelOpen(false)}
          onDiscard={() => {
            setActive(null)
            setStarting(null)
            setPanelOpen(false)
          }}
          onFinish={async (result) => {
            const failure = await store.finish(result)
            if (failure) return failure
            setActive(null)
            setStarting(null)
            setPanelOpen(false)
            setToast(result.task.completed ? 'Tarea terminada' : `Progreso guardado · ${result.task.progressPercentage}%`)
            return null
          }}
        />
      )}

      {toast && (
        <div role="status" className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] left-1/2 z-40 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 rounded-2xl border border-line bg-raised px-5 py-3 text-center text-sm shadow-xl">
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

  const repo = useMemo(() => (supabase && session ? new SupabaseRepository(supabase) : new LocalRepository()), [session])

  if (!ready) return null
  if (supabase && !session && !local) return <Auth onLocal={() => setLocal(true)} />
  return <Workspace key={session?.user.id ?? 'local'} repo={repo} />
}
