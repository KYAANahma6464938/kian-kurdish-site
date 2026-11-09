import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { planTask, type PlanStep } from '@/lib/ai'

export const dynamic = 'force-dynamic'
export const maxDuration = 600

export type StoredStep = PlanStep & {
  status: 'pending' | 'running' | 'done' | 'failed'
  result?: string
  error?: string
}

export type StoredLog = { at: string; level: 'info' | 'success' | 'error'; message: string }

/** GET /api/agent — list tasks. */
export async function GET() {
  const tasks = await db.agentTask.findMany({
    orderBy: { createdAt: 'desc' },
    include: { project: { select: { id: true, name: true } } },
  })
  return NextResponse.json({ tasks })
}

/**
 * POST /api/agent — create a task: AI plans the steps, nothing executes yet.
 * body: { instruction, language, projectId? }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const instruction: string = (body.instruction ?? '').toString().trim()
    const language: 'fa' | 'en' = body.language === 'en' ? 'en' : 'fa'
    const projectId: string | null = body.projectId || null

    if (!instruction) {
      return NextResponse.json({ error: 'instruction is required' }, { status: 400 })
    }

    let projectContext: string | undefined
    if (projectId) {
      const project = await db.project.findUnique({
        where: { id: projectId },
        include: { files: { select: { path: true } } },
      })
      if (project) projectContext = project.files.map((f) => f.path).join(', ') || '(empty project)'
    }

    const { title, steps } = await planTask({ instruction, language, projectContext })

    const storedSteps: StoredStep[] = steps.map((s) => ({ ...s, status: 'pending' as const }))
    const logs: StoredLog[] = [
      {
        at: new Date().toISOString(),
        level: 'info',
        message:
          language === 'fa'
            ? `برنامه با ${storedSteps.length} مرحله ساخته شد — منتظر تأیید مالک.`
            : `Plan created with ${storedSteps.length} steps — awaiting owner approval.`,
      },
    ]

    const task = await db.agentTask.create({
      data: {
        title: title.slice(0, 120),
        instruction,
        status: 'planned',
        plan: JSON.stringify(storedSteps),
        logs: JSON.stringify(logs),
        projectId,
      },
      include: { project: { select: { id: true, name: true } } },
    })

    return NextResponse.json({ task })
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: 'PLANNING_FAILED', detail }, { status: 502 })
  }
}
