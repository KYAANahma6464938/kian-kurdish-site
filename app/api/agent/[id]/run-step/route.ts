import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { executePlanStep } from '@/lib/ai'
import type { StoredStep, StoredLog } from '../../route'

export const dynamic = 'force-dynamic'
export const maxDuration = 600

function appendLogs(logs: StoredLog[], entries: Omit<StoredLog, 'at'>[]): StoredLog[] {
  return [...logs, ...entries.map((e) => ({ ...e, at: new Date().toISOString() }))]
}

/**
 * POST /api/agent/[id]/run-step
 * body: { stepId }
 * Executes exactly ONE approved step for real (LLM call + real file writes),
 * then returns the updated task. The frontend loops over approved steps,
 * so progress is live and every outcome (including failures) is genuine.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const stepId: string = (body.stepId ?? '').toString()
  const language: 'fa' | 'en' = body.language === 'en' ? 'en' : 'fa'

  const task = await db.agentTask.findUnique({ where: { id } })
  if (!task) return NextResponse.json({ error: 'task not found' }, { status: 404 })

  const steps: StoredStep[] = JSON.parse(task.plan || '[]')
  const logs: StoredLog[] = JSON.parse(task.logs || '[]')
  const step = steps.find((s) => s.id === stepId)
  if (!step) return NextResponse.json({ error: 'step not found' }, { status: 404 })
  if (step.status === 'running') {
    return NextResponse.json({ error: 'step already running' }, { status: 409 })
  }
  if (step.status === 'done') {
    return NextResponse.json({ task })
  }

  const fa = language === 'fa'
  const currentLogs = appendLogs(logs, [
    { level: 'info', message: fa ? `اجرای مرحله: ${step.title}` : `Running step: ${step.title}` },
  ])

  // Mark step running + persist immediately (honest live state)
  step.status = 'running'
  delete step.error
  await db.agentTask.update({
    where: { id },
    data: { status: 'running', plan: JSON.stringify(steps), logs: JSON.stringify(currentLogs) },
  })

  try {
    // Load target project (if any)
    let project = task.projectId
      ? await db.project.findUnique({ where: { id: task.projectId }, include: { files: true } })
      : null

    const result = await executePlanStep({
      instruction: task.instruction,
      step,
      language,
      projectType: project?.type,
      existingFiles: project?.files.map((f) => ({ path: f.path, content: f.content })),
    })

    let logEntries: Omit<StoredLog, 'at'>[] = []

    if (result.files.length > 0) {
      // Create the project lazily if the task had none (real file writes need a real project)
      if (!project) {
        project = await db.project.create({
          data: {
            name: task.title.slice(0, 80),
            description: task.instruction.slice(0, 500),
            type: 'custom',
          },
          include: { files: true },
        })
        logEntries.push({
          level: 'info',
          message: fa ? `پروژه «${project.name}» ساخته شد.` : `Project "${project.name}" created.`,
        })
      }

      for (const f of result.files) {
        const existing = await db.projectFile.findUnique({
          where: { projectId_path: { projectId: project.id, path: f.path } },
        })
        await db.projectFile.upsert({
          where: { projectId_path: { projectId: project.id, path: f.path } },
          update: { content: f.content },
          create: { projectId: project.id, path: f.path, content: f.content },
        })
        logEntries.push({
          level: 'success',
          message: fa
            ? `${existing ? 'به‌روزرسانی' : 'ساخت'} فایل: ${f.path} (${f.content.length.toLocaleString('fa-IR')} کاراکتر)`
            : `${existing ? 'Updated' : 'Created'} file: ${f.path} (${f.content.length.toLocaleString('en-US')} chars)`,
        })
      }
      await db.project.update({ where: { id: project.id }, data: { updatedAt: new Date() } })
    }

    if (result.summary) {
      logEntries.push({ level: 'info', message: result.summary })
    }

    step.status = 'done'
    step.result = result.summary || (result.files.length ? `${result.files.length} file(s)` : 'done')

    const allDone = steps.every((s) => s.status === 'done')
    const anyFailed = steps.some((s) => s.status === 'failed')
    const updatedTask = await db.agentTask.update({
      where: { id },
      data: {
        status: allDone ? 'completed' : anyFailed ? 'failed' : 'running',
        plan: JSON.stringify(steps),
        logs: JSON.stringify(appendLogs(currentLogs, logEntries)),
        projectId: project?.id ?? task.projectId,
      },
      include: { project: { select: { id: true, name: true } } },
    })

    return NextResponse.json({ task: updatedTask })
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    step.status = 'failed'
    step.error = detail.slice(0, 500)

    const updatedTask = await db.agentTask.update({
      where: { id },
      data: {
        status: 'failed',
        plan: JSON.stringify(steps),
        logs: appendLogs(currentLogs, [
          {
            level: 'error',
            message: fa
              ? `مرحله «${step.title}» شکست خورد: ${detail}`
              : `Step "${step.title}" failed: ${detail}`,
          },
        ]),
      },
      include: { project: { select: { id: true, name: true } } },
    })

    // Honest failure — reported as a failure, never disguised as success.
    return NextResponse.json({ task: updatedTask }, { status: 200 })
  }
}
