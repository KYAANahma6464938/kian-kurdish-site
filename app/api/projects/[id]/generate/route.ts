import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { generateProjectFiles } from '@/lib/ai'

export const dynamic = 'force-dynamic'
export const maxDuration = 600

/**
 * POST /api/projects/[id]/generate
 * body: { action: 'improve'|'fix'|'add', instruction?, language }
 * Real AI edit of an existing project. Returns the changed files.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()
    const action: 'improve' | 'fix' | 'add' = ['improve', 'fix', 'add'].includes(body.action)
      ? body.action
      : 'improve'
    const language: 'fa' | 'en' = body.language === 'en' ? 'en' : 'fa'
    const instruction: string = (body.instruction ?? '').toString().trim()

    const project = await db.project.findUnique({
      where: { id },
      include: { files: true },
    })
    if (!project) return NextResponse.json({ error: 'project not found' }, { status: 404 })

    const finalInstruction =
      instruction ||
      (action === 'improve'
        ? 'Improve the overall design, polish and responsiveness of this project.'
        : action === 'fix'
          ? 'Find and fix bugs in this project.'
          : 'Add a useful feature.')

    const result = await generateProjectFiles({
      mode: action,
      instruction: finalInstruction,
      language,
      projectType: project.type,
      existingFiles: project.files.map((f) => ({ path: f.path, content: f.content })),
    })

    // Apply changes for real
    for (const f of result.files) {
      await db.projectFile.upsert({
        where: { projectId_path: { projectId: id, path: f.path } },
        update: { content: f.content },
        create: { projectId: id, path: f.path, content: f.content },
      })
    }
    await db.project.update({
      where: { id },
      data: { updatedAt: new Date(), description: result.summary.slice(0, 500) || project.description },
    })

    const updated = await db.project.findUnique({
      where: { id },
      include: { files: { orderBy: { path: 'asc' } } },
    })

    return NextResponse.json({ summary: result.summary, changedFiles: result.files.map((f) => f.path), project: updated })
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: 'GENERATION_FAILED', detail }, { status: 502 })
  }
}
