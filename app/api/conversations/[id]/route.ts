import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

/** GET /api/conversations/[id] — conversation with all messages. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const conversation = await db.conversation.findUnique({
    where: { id },
    include: {
      messages: { orderBy: { createdAt: 'asc' } },
    },
  })
  if (!conversation) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json({ conversation })
}

/** PATCH /api/conversations/[id] — rename. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  const title: string | undefined = body.title?.toString().trim()
  if (!title) return NextResponse.json({ error: 'title is required' }, { status: 400 })
  const conversation = await db.conversation.update({ where: { id }, data: { title } })
  return NextResponse.json({ conversation })
}

/** DELETE /api/conversations/[id] */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await db.conversation.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
