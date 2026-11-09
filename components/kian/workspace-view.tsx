'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowRight,
  Bug,
  Code2,
  Download,
  ExternalLink,
  File as FileIcon,
  FileCode2,
  FilePlus2,
  FolderTree,
  Loader2,
  Monitor,
  Palette,
  Plus,
  RefreshCw,
  Smartphone,
  Sparkles,
  Trash2,
  Wand2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/hooks/use-toast'
import { useKian } from './kian-context'
import { CodeEditor } from './code-editor'
import type { Project, ProjectFile } from '@/lib/types'

type ViewMode = 'code' | 'preview' | 'split'

const TYPE_OPTIONS = ['landing', 'dashboard', 'webapp', 'react', 'custom'] as const

type Dict = ReturnType<typeof useKian>['t']

function typeLabel(t: Dict, type: string): string {
  return (t.workspace.types as Record<string, string>)[type] ?? type
}

function fileIcon(path: string) {
  if (path.endsWith('.html')) return <Code2 className="h-3.5 w-3.5 text-orange-400/80" />
  if (path.endsWith('.css')) return <Palette className="h-3.5 w-3.5 text-purple-soft" />
  if (/\.(js|jsx|ts|tsx)$/.test(path)) return <FileCode2 className="h-3.5 w-3.5 text-gold" />
  return <FileIcon className="h-3.5 w-3.5 text-muted-foreground" />
}

export function WorkspaceView({
  autoOpenProjectId,
  onAutoOpened,
}: {
  autoOpenProjectId?: string | null
  onAutoOpened?: () => void
}) {
  const { t, language } = useKian()
  const { toast } = useToast()

  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState<'list' | 'create' | 'detail'>('list')
  const [project, setProject] = useState<Project | null>(null)

  // create form
  const [instruction, setInstruction] = useState('')
  const [name, setName] = useState('')
  const [type, setType] = useState<(typeof TYPE_OPTIONS)[number]>('landing')
  const [generating, setGenerating] = useState(false)
  const [genStep, setGenStep] = useState(0)

  // editor state
  const [activeFile, setActiveFile] = useState<ProjectFile | null>(null)
  const [editorValue, setEditorValue] = useState('')
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>('split')
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop')
  const [previewKey, setPreviewKey] = useState(0)
  const [addingFile, setAddingFile] = useState(false)
  const [newFilePath, setNewFilePath] = useState('')

  // AI edit state
  const [aiBusy, setAiBusy] = useState<null | 'improve' | 'fix' | 'add'>(null)
  const [featureText, setFeatureText] = useState('')
  const genTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const openProjectRef = useRef<(id: string) => void>(() => {})

  const loadProjects = useCallback(async () => {
    try {
      const res = await fetch('/api/projects')
      const data = await res.json()
      setProjects(data.projects ?? [])
    } catch {
      /* ignore */
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadProjects()
  }, [loadProjects])

  // open a project requested from another view (e.g. agent report)
  useEffect(() => {
    if (autoOpenProjectId) {
      openProjectRef.current?.(autoOpenProjectId)
      onAutoOpened?.()
    }
  }, [autoOpenProjectId, onAutoOpened])

  // rotating generation status texts
  useEffect(() => {
    if (generating || aiBusy) {
      setGenStep(0)
      genTimer.current = setInterval(() => setGenStep((s) => s + 1), 3500)
      return () => {
        if (genTimer.current) clearInterval(genTimer.current)
      }
    }
  }, [generating, aiBusy])

  const openProject = async (id: string) => {
    try {
      const res = await fetch(`/api/projects/${id}`)
      if (!res.ok) return
      const data = await res.json()
      setProject(data.project)
      const first = (data.project.files ?? [])[0] ?? null
      setActiveFile(first)
      setEditorValue(first?.content ?? '')
      setDirty(false)
      setViewMode('split')
      setPreviewKey(Date.now())
      setMode('detail')
    } catch {
      /* ignore */
    }
  }
  openProjectRef.current = openProject

  const createProject = async () => {
    if (!instruction.trim() || generating) return
    setGenerating(true)
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'ai', instruction, name, type, language }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || t.common.error)
      toast({ description: data.summary || t.workspace.generate })
      setGenerating(false)
      setInstruction('')
      setName('')
      await loadProjects()
      openProject(data.project.id)
    } catch (err) {
      setGenerating(false)
      toast({
        variant: 'destructive',
        description: err instanceof Error ? err.message : t.common.error,
      })
    }
  }

  const deleteProject = async (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation()
    if (!window.confirm(t.workspace.confirmDeleteProject)) return
    await fetch(`/api/projects/${id}`, { method: 'DELETE' })
    toast({ description: t.workspace.deleted })
    if (project?.id === id) {
      setProject(null)
      setMode('list')
    }
    loadProjects()
  }

  const selectFile = (f: ProjectFile) => {
    if (dirty && !window.confirm(t.workspace.unsaved + ' — ' + t.common.confirm + '?')) return
    setActiveFile(f)
    setEditorValue(f.content)
    setDirty(false)
  }

  const saveFile = async () => {
    if (!project || !activeFile || saving) return
    setSaving(true)
    try {
      const res = await fetch(`/api/projects/${project.id}/files`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: activeFile.path, content: editorValue }),
      })
      if (!res.ok) throw new Error()
      const data = await res.json()
      setActiveFile(data.file)
      setProject((p) =>
        p
          ? { ...p, files: (p.files ?? []).map((f) => (f.id === data.file.id ? data.file : f)) }
          : p
      )
      setDirty(false)
      setPreviewKey(Date.now())
      toast({ description: t.workspace.saved })
    } catch {
      toast({ variant: 'destructive', description: t.common.error })
    } finally {
      setSaving(false)
    }
  }

  const addFile = async () => {
    if (!project || !newFilePath.trim()) return
    const path = newFilePath.trim()
    const res = await fetch(`/api/projects/${project.id}/files`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, content: '' }),
    })
    if (res.ok) {
      setAddingFile(false)
      setNewFilePath('')
      await openProject(project.id)
      toast({ description: path })
    }
  }

  const deleteFile = async (f: ProjectFile, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!project) return
    if (!window.confirm(f.path + ' — ' + t.common.delete + '?')) return
    await fetch(`/api/projects/${project.id}/files?path=${encodeURIComponent(f.path)}`, {
      method: 'DELETE',
    })
    await openProject(project.id)
  }

  const aiAction = async (action: 'improve' | 'fix' | 'add') => {
    if (!project || aiBusy) return
    if (action === 'add' && !featureText.trim()) return
    setAiBusy(action)
    try {
      const res = await fetch(`/api/projects/${project.id}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, instruction: featureText, language }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || t.common.error)
      setProject(data.project)
      // refresh the currently open file if it changed
      const changed: string[] = data.changedFiles ?? []
      const stillThere = (data.project.files as ProjectFile[]).find(
        (f) => f.id === activeFile?.id
      )
      if (stillThere) {
        setActiveFile(stillThere)
        setEditorValue(stillThere.content)
      } else {
        const first = (data.project.files ?? [])[0] ?? null
        setActiveFile(first)
        setEditorValue(first?.content ?? '')
      }
      setDirty(false)
      setPreviewKey(Date.now())
      setFeatureText('')
      toast({
        description: `${data.summary ?? ''} (${changed.join('، ')})`,
      })
    } catch (err) {
      toast({
        variant: 'destructive',
        description: err instanceof Error ? err.message : t.common.error,
      })
    } finally {
      setAiBusy(null)
    }
  }

  const exportHtml = () => {
    if (project) window.open(`/api/projects/${project.id}/preview?download=1`, '_blank')
  }

  // ─── Create screen ────────────────────────────────────────────
  if (mode === 'create') {
    return (
      <div className="kian-scroll h-full overflow-y-auto p-4 sm:p-6" dir={t.dir}>
        <div className="mx-auto max-w-2xl">
          <Button variant="ghost" size="sm" onClick={() => setMode('list')} className="mb-4 gap-2">
            <ArrowRight className="h-4 w-4 rtl:-scale-x-100" />
            {t.workspace.title}
          </Button>

          <div className="kian-glass rounded-2xl p-5 sm:p-6">
            <div className="mb-1 flex items-center gap-2">
              <Wand2 className="h-5 w-5 text-gold" />
              <h2 className="text-lg font-bold">{t.workspace.createTitle}</h2>
            </div>
            <p className="mb-5 text-sm text-muted-foreground">{t.workspace.createSub}</p>

            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              {t.workspace.instruction}
            </label>
            <textarea
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              rows={4}
              className="kian-scroll mb-4 w-full resize-none rounded-xl border border-border bg-input/40 px-4 py-3 text-sm leading-6 outline-none transition-all focus:border-gold/50 focus:ring-2 focus:ring-gold/20"
              placeholder={t.workspace.instruction}
            />

            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              {t.workspace.projectType}
            </label>
            <div className="mb-2 flex flex-wrap gap-2">
              {TYPE_OPTIONS.map((tp) => (
                <button
                  key={tp}
                  onClick={() => setType(tp)}
                  className={`rounded-full border px-3.5 py-1.5 text-xs transition-all ${
                    type === tp
                      ? 'border-gold bg-gold/15 font-semibold text-gold'
                      : 'border-border text-muted-foreground hover:border-gold/40'
                  }`}
                >
                  {t.workspace.types[tp]}
                </button>
              ))}
            </div>
            <p className="mb-4 text-xs text-muted-foreground/80">{t.workspace.typeHints[type]}</p>

            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              {t.workspace.projectName}
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mb-5 bg-input/40"
              placeholder={t.workspace.projectName}
            />

            <Button
              onClick={createProject}
              disabled={!instruction.trim() || generating}
              className="w-full gap-2 bg-gradient-to-l from-purple to-gold font-bold text-white hover:opacity-90"
            >
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {generating ? t.workspace.aiBusy : t.workspace.generate}
            </Button>
          </div>
        </div>

        <GeneratingOverlay show={generating} text={t.workspace.generatingSteps[genStep % t.workspace.generatingSteps.length]} />
      </div>
    )
  }

  // ─── Detail screen ────────────────────────────────────────────
  if (mode === 'detail' && project) {
    const files = project.files ?? []
    return (
      <div className="flex h-full min-h-0 flex-col" dir={t.dir}>
        {/* header */}
        <div className="flex flex-wrap items-center gap-2 border-b border-border/60 px-3 py-2 sm:px-4">
          <Button variant="ghost" size="sm" onClick={() => { setMode('list'); setProject(null); loadProjects() }} className="gap-1.5">
            <ArrowRight className="h-4 w-4 rtl:-scale-x-100" />
          </Button>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-bold sm:text-base">{project.name}</h2>
            <p className="truncate text-[11px] text-muted-foreground">
              {typeLabel(t, project.type)} · {files.length} {t.workspace.files}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="sm" onClick={exportHtml} className="gap-1.5">
              <Download className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t.workspace.exportHtml}</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => deleteProject(project.id, e)}
              className="gap-1.5 text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* AI action bar */}
        <div className="flex flex-wrap items-center gap-2 border-b border-border/60 bg-card/30 px-3 py-2 sm:px-4">
          <Button variant="secondary" size="sm" onClick={() => aiAction('improve')} disabled={!!aiBusy} className="gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-gold" />
            {t.workspace.improve}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => aiAction('fix')} disabled={!!aiBusy} className="gap-1.5">
            <Bug className="h-3.5 w-3.5 text-purple-soft" />
            {t.workspace.fixBugs}
          </Button>
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            <Input
              value={featureText}
              onChange={(e) => setFeatureText(e.target.value)}
              placeholder={t.workspace.featurePlaceholder}
              className="h-8 min-w-32 flex-1 bg-input/40 text-xs"
            />
            <Button
              size="sm"
              onClick={() => aiAction('add')}
              disabled={!!aiBusy || !featureText.trim()}
              className="gap-1 bg-gradient-to-l from-purple to-gold text-white hover:opacity-90"
            >
              <Plus className="h-3.5 w-3.5" />
              {t.workspace.apply}
            </Button>
          </div>
        </div>

        {/* body */}
        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[220px_1fr]">
          {/* file tree */}
          <div className="kian-scroll hidden flex-col overflow-y-auto border-e border-border/60 p-2 lg:flex">
            <div className="mb-1 flex items-center justify-between px-1">
              <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                <FolderTree className="h-3.5 w-3.5" />
                {t.workspace.files}
              </span>
              <button
                onClick={() => setAddingFile(true)}
                className="rounded p-1 text-muted-foreground hover:bg-white/5 hover:text-gold"
                aria-label={t.workspace.addFile}
              >
                <FilePlus2 className="h-3.5 w-3.5" />
              </button>
            </div>
            {addingFile && (
              <div className="mb-1 px-1">
                <Input
                  autoFocus
                  value={newFilePath}
                  onChange={(e) => setNewFilePath(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addFile()}
                  placeholder={t.workspace.fileName}
                  className="ltr-mono h-7 bg-input/40 text-[11px]"
                />
              </div>
            )}
            {files.map((f) => (
              <div
                key={f.id}
                onClick={() => selectFile(f)}
                className={`group flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1.5 text-xs transition-colors ${
                  activeFile?.id === f.id ? 'bg-gold/10 text-gold' : 'text-muted-foreground hover:bg-white/5'
                }`}
              >
                {fileIcon(f.path)}
                <span className="ltr-mono min-w-0 flex-1 truncate">{f.path}</span>
                <button
                  onClick={(e) => deleteFile(f, e)}
                  className="opacity-0 hover:text-destructive group-hover:opacity-100"
                  aria-label={t.common.delete}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>

          {/* editor + preview */}
          <div className="flex min-h-0 flex-col">
            {/* view mode bar */}
            <div className="flex items-center gap-2 border-b border-border/60 px-3 py-1.5">
              <div className="flex rounded-lg border border-border p-0.5">
                {(['code', 'split', 'preview'] as ViewMode[]).map((vm) => (
                  <button
                    key={vm}
                    onClick={() => setViewMode(vm)}
                    className={`rounded-md px-2.5 py-1 text-[11px] transition-colors ${
                      viewMode === vm ? 'bg-gold/15 font-semibold text-gold' : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {vm === 'code' ? t.workspace.code : vm === 'preview' ? t.workspace.preview : t.workspace.split}
                  </button>
                ))}
              </div>
              {activeFile && (
                <span className="ltr-mono hidden truncate text-[11px] text-muted-foreground sm:inline">
                  {activeFile.path}
                  {dirty && <span className="ms-1 text-gold">●</span>}
                </span>
              )}
              <div className="flex-1" />
              {activeFile && (
                <Button size="sm" onClick={saveFile} disabled={!dirty || saving} className="h-7 gap-1 bg-gold px-3 text-[11px] font-bold text-black hover:bg-gold-bright">
                  {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                  {t.workspace.save}
                  <span className="ltr-mono hidden opacity-60 sm:inline">({t.workspace.saveHint})</span>
                </Button>
              )}
            </div>

            {/* mobile file selector */}
            <div className="kian-scroll flex gap-1 overflow-x-auto border-b border-border/60 p-2 lg:hidden">
              {files.map((f) => (
                <button
                  key={f.id}
                  onClick={() => selectFile(f)}
                  className={`ltr-mono shrink-0 rounded-md border px-2 py-1 text-[11px] ${
                    activeFile?.id === f.id ? 'border-gold/40 bg-gold/10 text-gold' : 'border-border text-muted-foreground'
                  }`}
                >
                  {f.path}
                </button>
              ))}
            </div>

            <div className={`grid min-h-0 flex-1 ${viewMode === 'split' ? 'grid-cols-1 xl:grid-cols-2' : 'grid-cols-1'} divide-y xl:divide-y-0 ${viewMode === 'split' ? 'xl:divide-x' : ''} divide-border/60`}>
              {viewMode !== 'preview' && (
                <div className="min-h-0 p-2 sm:p-3">
                  {activeFile ? (
                    <CodeEditor
                      value={editorValue}
                      onChange={(v) => {
                        setEditorValue(v)
                        setDirty(true)
                      }}
                      onSave={saveFile}
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                      {t.workspace.noFileSelected}
                    </div>
                  )}
                </div>
              )}
              {viewMode !== 'code' && (
                <div className="flex min-h-0 flex-col p-2 sm:p-3">
                  <div className="mb-2 flex items-center gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 gap-1 px-2 text-[11px]"
                      onClick={() => setPreviewKey(Date.now())}
                    >
                      <RefreshCw className="h-3 w-3" />
                      {t.workspace.refresh}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 gap-1 px-2 text-[11px]"
                      onClick={() => window.open(`/api/projects/${project.id}/preview`, '_blank')}
                    >
                      <ExternalLink className="h-3 w-3" />
                      {t.workspace.openTab}
                    </Button>
                    <div className="flex-1" />
                    <div className="flex rounded-lg border border-border p-0.5">
                      <button
                        onClick={() => setDevice('desktop')}
                        className={`rounded-md p-1 ${device === 'desktop' ? 'bg-gold/15 text-gold' : 'text-muted-foreground'}`}
                        aria-label={t.workspace.desktop}
                      >
                        <Monitor className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => setDevice('mobile')}
                        className={`rounded-md p-1 ${device === 'mobile' ? 'bg-gold/15 text-gold' : 'text-muted-foreground'}`}
                        aria-label={t.workspace.mobile}
                      >
                        <Smartphone className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  {project.type === 'react' && (
                    <p className="mb-2 rounded-lg border border-purple/30 bg-purple/10 px-3 py-1.5 text-[11px] text-purple-soft">
                      {t.workspace.reactNote}
                    </p>
                  )}
                  <div className="kian-scroll min-h-0 flex-1 overflow-auto rounded-xl border border-border bg-white" dir="ltr">
                    <iframe
                      key={previewKey}
                      src={`/api/projects/${project.id}/preview`}
                      title="KIAN project preview"
                      className="mx-auto h-full min-h-[320px] border-0 bg-white transition-all"
                      style={{ width: device === 'mobile' ? 390 : '100%', maxWidth: '100%' }}
                      sandbox="allow-scripts allow-forms allow-popups allow-modals"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <GeneratingOverlay
          show={!!aiBusy}
          text={t.workspace.generatingSteps[genStep % t.workspace.generatingSteps.length]}
        />
      </div>
    )
  }

  // ─── List screen ──────────────────────────────────────────────
  return (
    <div className="kian-scroll h-full overflow-y-auto p-4 sm:p-6" dir={t.dir}>
      <div className="mx-auto max-w-4xl">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-extrabold sm:text-2xl">{t.workspace.title}</h1>
            <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">{t.workspace.subtitle}</p>
          </div>
          <Button
            onClick={() => setMode('create')}
            className="gap-2 bg-gradient-to-l from-purple to-gold font-bold text-white hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
            {t.workspace.newProject}
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-gold" />
          </div>
        ) : projects.length === 0 ? (
          <div className="kian-glass flex flex-col items-center rounded-2xl py-16 text-center">
            <Wand2 className="mb-3 h-8 w-8 text-gold" />
            <p className="text-sm text-muted-foreground">{t.workspace.empty}</p>
            <Button
              onClick={() => setMode('create')}
              className="mt-4 gap-2 bg-gradient-to-l from-purple to-gold text-white hover:opacity-90"
            >
              <Sparkles className="h-4 w-4" />
              {t.workspace.newProject}
            </Button>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {projects.map((p, i) => (
              <motion.div
                key={p.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                onClick={() => openProject(p.id)}
                className="kian-glass group cursor-pointer rounded-2xl p-4 transition-all hover:-translate-y-0.5 hover:border-gold/40"
              >
                <div className="mb-2 flex items-start justify-between gap-2">
                  <h3 className="line-clamp-1 font-bold">{p.name}</h3>
                  <span className="shrink-0 rounded-full border border-purple/40 bg-purple/10 px-2 py-0.5 text-[10px] text-purple-soft">
                    {typeLabel(t, p.type)}
                  </span>
                </div>
                {p.description && (
                  <p className="mb-3 line-clamp-2 min-h-8 text-xs leading-5 text-muted-foreground">{p.description}</p>
                )}
                <div className="flex items-center justify-between">
                  <span className="ltr-mono text-[11px] text-muted-foreground">
                    {(p._count?.files ?? 0)} {t.workspace.files}
                  </span>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-[11px] text-gold"
                      onClick={(e) => deleteProject(p.id, e)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                    <span className="flex items-center gap-1 text-[11px] font-semibold text-gold opacity-0 transition-opacity group-hover:opacity-100">
                      {t.workspace.open}
                      <ArrowRight className="h-3 w-3 rtl:-scale-x-100" />
                    </span>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function GeneratingOverlay({ show, text }: { show: boolean; text: string }) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/70 backdrop-blur-sm"
        >
          <div className="kian-logo animate-glow-pulse mb-5 flex h-16 w-16 rotate-45 items-center justify-center rounded-2xl">
            <span className="-rotate-45 text-2xl font-extrabold text-black">K</span>
          </div>
          <p className="mb-4 text-sm font-medium text-gold">{text}</p>
          <div className="h-1 w-48 overflow-hidden rounded-full bg-white/10">
            <div className="kian-shimmer h-full w-full" />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
