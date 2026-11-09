import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

/** GET /api/agent/[id] — full task (steps + logs). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const task = await db.agentTask.findUnique({
    where: { id },
    include: { project: { select: { id: true, name: true } } },
  })
  if (!task) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json({ task })
}

/** DELETE /api/agent/[id] */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await db.agentTask.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
