import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

function sanitizePath(raw: string): string {
  return raw
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .split('/')
    .filter((p) => p && p !== '.' && p !== '..')
    .join('/')
}

/** PUT /api/projects/[id]/files — create or update a single file. */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  const path = sanitizePath((body.path ?? '').toString())
  const content: string = (body.content ?? '').toString()
  if (!path) return NextResponse.json({ error: 'path is required' }, { status: 400 })
  if (content.length > 500_000) {
    return NextResponse.json({ error: 'file too large (max 500KB)' }, { status: 400 })
  }

  const project = await db.project.findUnique({ where: { id } })
  if (!project) return NextResponse.json({ error: 'project not found' }, { status: 404 })

  const file = await db.projectFile.upsert({
    where: { projectId_path: { projectId: id, path } },
    update: { content },
    create: { projectId: id, path, content },
  })
  await db.project.update({ where: { id }, data: { updatedAt: new Date() } })
  return NextResponse.json({ file })
}

/** DELETE /api/projects/[id]/files?path=css/styles.css */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const path = sanitizePath(req.nextUrl.searchParams.get('path') ?? '')
  if (!path) return NextResponse.json({ error: 'path is required' }, { status: 400 })
  try {
    await db.projectFile.delete({ where: { projectId_path: { projectId: id, path } } })
  } catch {
    return NextResponse.json({ error: 'file not found' }, { status: 404 })
  }
  return NextResponse.json({ ok: true })
}
