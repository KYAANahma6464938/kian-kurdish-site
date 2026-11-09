'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Bot,
  CheckCircle2,
  ChevronDown,
  Circle,
  Eraser,
  Eye,
  FileCheck2,
  History,
  ListChecks,
  Loader2,
  Pencil,
  Play,
  RotateCcw,
  Trash2,
  XCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { useKian } from './kian-context'
import { parseLogs, parseSteps, type AgentLog, type AgentStep, type AgentTask } from '@/lib/types'

function StepIcon({ status }: { status: AgentStep['status'] }) {
  if (status === 'done') return <CheckCircle2 className="h-4 w-4 shrink-0 text-gold" />
  if (status === 'running') return <Loader2 className="h-4 w-4 shrink-0 animate-spin text-purple-soft" />
  if (status === 'failed') return <XCircle className="h-4 w-4 shrink-0 text-destructive" />
  return <Circle className="h-4 w-4 shrink-0 text-muted-foreground/50" />
}

export function AgentView({ onOpenProject }: { onOpenProject: (id: string) => void }) {
  const { t, language } = useKian()
  const { toast } = useToast()

  const [tasks, setTasks] = useState<AgentTask[]>([])
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([])
  const [current, setCurrent] = useState<AgentTask | null>(null)
  const [instruction, setInstruction] = useState('')
  const [projectId, setProjectId] = useState('')
  const [planning, setPlanning] = useState(false)
  const [executing, setExecuting] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [showHistory, setShowHistory] = useState(false)
  const abortRef = useRef(false)

  const loadTasks = useCallback(async () => {
    try {
      const res = await fetch('/api/agent')
      const data = await res.json()
      setTasks(data.tasks ?? [])
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    loadTasks()
    fetch('/api/projects')
      .then((r) => r.json())
      .then((d) => setProjects((d.projects ?? []).map((p: { id: string; name: string }) => ({ id: p.id, name: p.name }))))
      .catch(() => {})
  }, [loadTasks])

  const steps = useMemo(() => (current ? parseSteps(current) : []), [current])
  const logs = useMemo(() => (current ? parseLogs(current) : []), [current])

  const plan = async () => {
    if (!instruction.trim() || planning) return
    setPlanning(true)
    try {
      const res = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instruction, projectId: projectId || null, language }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || t.common.error)
      setCurrent(data.task)
      setSelected(new Set(parseSteps(data.task).map((s: AgentStep) => s.id)))
      setInstruction('')
      loadTasks()
    } catch (err) {
      toast({ variant: 'destructive', description: err instanceof Error ? err.message : t.common.error })
    } finally {
      setPlanning(false)
    }
  }

  const runStep = async (task: AgentTask, stepId: string): Promise<AgentTask> => {
    const res = await fetch(`/api/agent/${task.id}/run-step`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stepId, language }),
    })
    const data = await res.json()
    if (data.task) setCurrent(data.task)
    return data.task as AgentTask
  }

  const execute = async () => {
    if (!current || executing) return
    setExecuting(true)
    abortRef.current = false
    let task = current
    try {
      for (const step of parseSteps(task)) {
        if (abortRef.current) break
        if (!selected.has(step.id) || step.status === 'done') continue
        const updated = await runStep(task, step.id)
        task = updated ?? task
        const stepNow = parseSteps(task).find((s) => s.id === step.id)
        if (stepNow?.status === 'failed') {
          // honest stop: a failed step halts the run and is reported as failed
          toast({ variant: 'destructive', description: t.agent.failedHonest })
          break
        }
      }
      loadTasks()
    } catch (err) {
      toast({
        variant: 'destructive',
        description: err instanceof Error ? err.message : t.common.error,
      })
    } finally {
      setExecuting(false)
    }
  }

  const retryStep = async (stepId: string) => {
    if (!current || executing) return
    setExecuting(true)
    try {
      const updated = await runStep(current, stepId)
      if (updated) {
        const st = parseSteps(updated).find((s) => s.id === stepId)
        if (st?.status === 'failed') toast({ variant: 'destructive', description: t.agent.failedHonest })
      }
      loadTasks()
    } catch (err) {
      toast({ variant: 'destructive', description: err instanceof Error ? err.message : t.common.error })
    } finally {
      setExecuting(false)
    }
  }

  const openTask = async (id: string) => {
    const res = await fetch(`/api/agent/${id}`)
    if (!res.ok) return
    const data = await res.json()
    setCurrent(data.task)
    setSelected(new Set(parseSteps(data.task).filter((s: AgentStep) => s.status !== 'done').map((s: AgentStep) => s.id)))
    setShowHistory(false)
  }

  const deleteTask = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    await fetch(`/api/agent/${id}`, { method: 'DELETE' })
    if (current?.id === id) setCurrent(null)
    loadTasks()
  }

  const toggleStep = (id: string) => {
    setSelected((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  return (
    <div className="kian-scroll h-full overflow-y-auto p-4 sm:p-6" dir={t.dir}>
      <div className="mx-auto max-w-3xl">
        {/* header */}
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-extrabold sm:text-2xl">
              <Bot className="h-6 w-6 text-gold" />
              {t.agent.title}
            </h1>
            <p className="mt-0.5 max-w-xl text-xs leading-5 text-muted-foreground sm:text-sm">{t.agent.subtitle}</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setShowHistory(true)} className="gap-1.5">
            <History className="h-3.5 w-3.5" />
            {t.agent.history}
          </Button>
        </div>

        <p className="mb-4 rounded-xl border border-gold/25 bg-gold/5 px-3.5 py-2.5 text-[11px] leading-5 text-foreground/80">
          <FileCheck2 className="me-1.5 inline h-3.5 w-3.5 text-gold" />
          {t.agent.realNote}
        </p>

        {/* new task */}
        <div className="kian-glass mb-5 rounded-2xl p-4 sm:p-5">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold">
            <ListChecks className="h-4 w-4 text-gold" />
            {t.agent.newTask}
          </h2>
          <textarea
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            rows={3}
            placeholder={t.agent.instruction}
            className="kian-scroll mb-3 w-full resize-none rounded-xl border border-border bg-input/40 px-4 py-3 text-sm leading-6 outline-none transition-all focus:border-gold/50 focus:ring-2 focus:ring-gold/20"
          />
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="h-9 rounded-lg border border-border bg-input/40 px-3 text-xs outline-none focus:border-gold/50"
              aria-label={t.agent.targetProject}
            >
              <option value="">{t.agent.noProject}</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <div className="flex-1" />
            <Button
              onClick={plan}
              disabled={!instruction.trim() || planning}
              className="gap-2 bg-gradient-to-l from-purple to-gold font-bold text-white hover:opacity-90"
            >
              {planning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              {planning ? t.agent.planning : t.agent.plan}
            </Button>
          </div>
        </div>

        {/* current task */}
        <AnimatePresence>
          {current && (
            <motion.div
              key={current.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="kian-glass mb-5 rounded-2xl p-4 sm:p-5"
            >
              <div className="mb-3 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="truncate font-bold">{current.title}</h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {t.agent.statuses[current.status as keyof typeof t.agent.statuses] ?? current.status}
                    {current.project ? ` · ${current.project.name}` : ''}
                  </p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setCurrent(null)} className="gap-1 text-xs">
                  <Eraser className="h-3.5 w-3.5" />
                  {t.common.close}
                </Button>
              </div>

              {/* steps */}
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {t.agent.steps}
              </p>
              <div className="mb-4 space-y-2">
                {steps.map((s) => (
                  <div
                    key={s.id}
                    className={`rounded-xl border p-3 transition-colors ${
                      s.status === 'failed'
                        ? 'border-destructive/40 bg-destructive/5'
                        : s.status === 'done'
                          ? 'border-gold/30 bg-gold/5'
                          : 'border-border bg-card/40'
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      {current.status === 'planned' && s.status === 'pending' ? (
                        <input
                          type="checkbox"
                          checked={selected.has(s.id)}
                          onChange={() => toggleStep(s.id)}
                          className="mt-1 h-4 w-4 accent-[var(--gold)]"
                          aria-label={s.title}
                        />
                      ) : (
                        <span className="mt-0.5">
                          <StepIcon status={s.status} />
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold">{s.title}</span>
                          <span className="rounded-full border border-purple/30 bg-purple/10 px-2 py-0.5 text-[10px] text-purple-soft">
                            {t.agent.stepTypes[s.type as keyof typeof t.agent.stepTypes] ?? s.type}
                          </span>
                          {s.status === 'pending' && current.status !== 'planned' && (
                            <span className="text-[10px] text-muted-foreground">
                              {t.agent.statuses.pending}
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">{s.description}</p>
                        {s.status === 'done' && s.result && (
                          <p className="mt-1.5 text-xs text-gold">✓ {s.result}</p>
                        )}
                        {s.status === 'failed' && (
                          <div className="mt-1.5">
                            <p className="text-xs text-destructive">
                              {t.agent.failedHonest}
                              {s.error ? ` — ${s.error}` : ''}
                            </p>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => retryStep(s.id)}
                              disabled={executing}
                              className="mt-1.5 h-7 gap-1 text-[11px]"
                            >
                              <RotateCcw className="h-3 w-3" />
                              {t.agent.retryStep}
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* approve & execute */}
              {current.status === 'planned' && (
                <Button
                  onClick={execute}
                  disabled={executing || selected.size === 0}
                  className="w-full gap-2 bg-gradient-to-l from-purple to-gold font-bold text-white hover:opacity-90"
                >
                  {executing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  {executing ? t.agent.executing : `${t.agent.approveExecute} (${selected.size})`}
                </Button>
              )}

              {/* live log */}
              {logs.length > 0 && (
                <div className="mt-4">
                  <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    {t.agent.log}
                  </p>
                  <div className="kian-scroll max-h-56 overflow-y-auto rounded-xl border border-white/10 bg-black/40 p-3" dir="ltr">
                    {logs.map((l: AgentLog, i: number) => (
                      <div key={i} className="ltr-mono flex gap-2 py-0.5 text-[11px] leading-5">
                        <span className="shrink-0 text-white/25">
                          {new Date(l.at).toLocaleTimeString('en-GB', { hour12: false })}
                        </span>
                        <span
                          className={
                            l.level === 'error'
                              ? 'text-red-400'
                              : l.level === 'success'
                                ? 'text-gold'
                                : 'text-muted-foreground'
                          }
                        >
                          {l.level === 'error' ? '✗' : l.level === 'success' ? '✓' : '·'}
                        </span>
                        <span
                          className={`min-w-0 flex-1 break-words ${
                            l.level === 'error' ? 'text-red-300' : l.level === 'success' ? 'text-gold/90' : 'text-foreground/75'
                          }`}
                        >
                          {l.message}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* final report */}
              {(current.status === 'completed' || current.status === 'failed') && current.project && (
                <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-gold/30 bg-gold/10 p-3">
                  <Pencil className="h-4 w-4 text-gold" />
                  <span className="text-xs">
                    {current.status === 'completed' ? '✓ ' : '! '}
                    {current.project.name}
                  </span>
                  <div className="flex-1" />
                  <Button size="sm" variant="outline" onClick={() => onOpenProject(current.project!.id)} className="h-7 gap-1 text-[11px]">
                    <Eye className="h-3 w-3" />
                    {t.workspace.open}
                  </Button>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* history (inline on desktop) */}
        <div className="hidden sm:block">
          <HistoryList tasks={tasks} onOpen={openTask} onDelete={deleteTask} t={t} />
        </div>
      </div>

      {/* history drawer (mobile) */}
      <AnimatePresence>
        {showHistory && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/60 sm:hidden"
            onClick={() => setShowHistory(false)}
          >
            <motion.div
              initial={{ y: 300 }}
              animate={{ y: 0 }}
              exit={{ y: 300 }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              className="absolute inset-x-0 bottom-0 max-h-[70vh] overflow-y-auto rounded-t-2xl bg-card p-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-3 flex items-center justify-between">
                <span className="font-bold">{t.agent.history}</span>
                <Button variant="ghost" size="sm" onClick={() => setShowHistory(false)}>
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </div>
              <HistoryList tasks={tasks} onOpen={openTask} onDelete={deleteTask} t={t} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function HistoryList({
  tasks,
  onOpen,
  onDelete,
  t,
}: {
  tasks: AgentTask[]
  onOpen: (id: string) => void
  onDelete: (id: string, e: React.MouseEvent) => void
  t: ReturnType<typeof useKian>['t']
}) {
  const statusColor = (s: string) =>
    s === 'completed'
      ? 'border-gold/40 bg-gold/10 text-gold'
      : s === 'failed'
        ? 'border-destructive/40 bg-destructive/10 text-destructive'
        : s === 'running'
          ? 'border-purple/40 bg-purple/10 text-purple-soft'
          : 'border-border text-muted-foreground'

  return (
    <div className="kian-glass rounded-2xl p-4">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-bold">
        <History className="h-4 w-4 text-gold" />
        {t.agent.history}
      </h2>
      {tasks.length === 0 ? (
        <p className="py-3 text-xs text-muted-foreground">{t.agent.noTasks}</p>
      ) : (
        <div className="space-y-1.5">
          {tasks.map((task) => (
            <div
              key={task.id}
              onClick={() => onOpen(task.id)}
              className="group flex cursor-pointer items-center gap-2 rounded-lg border border-transparent px-2.5 py-2 text-sm transition-colors hover:bg-white/5"
            >
              <span className="min-w-0 flex-1 truncate">{task.title}</span>
              <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] ${statusColor(task.status)}`}>
                {t.agent.statuses[task.status as keyof typeof t.agent.statuses] ?? task.status}
              </span>
              <button
                onClick={(e) => onDelete(task.id, e)}
                className="text-muted-foreground opacity-0 hover:text-destructive group-hover:opacity-100"
                aria-label={t.common.delete}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
