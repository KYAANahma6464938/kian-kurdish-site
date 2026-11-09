import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

/** GET /api/projects/[id] — project with all files. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const project = await db.project.findUnique({
    where: { id },
    include: { files: { orderBy: { path: 'asc' } } },
  })
  if (!project) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json({ project })
}

/** PATCH /api/projects/[id] — rename / edit description. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  const data: { name?: string; description?: string } = {}
  if (typeof body.name === 'string' && body.name.trim()) data.name = body.name.trim().slice(0, 80)
  if (typeof body.description === 'string') data.description = body.description.slice(0, 500)
  const project = await db.project.update({ where: { id }, data })
  return NextResponse.json({ project })
}

/** DELETE /api/projects/[id] */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await db.project.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
