import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

/** GET /api/conversations — list conversations (newest first). */
export async function GET() {
  const conversations = await db.conversation.findMany({
    orderBy: { updatedAt: 'desc' },
    include: { _count: { select: { messages: true } } },
  })
  return NextResponse.json({ conversations })
}

/** DELETE /api/conversations — wipe all conversations. */
export async function DELETE() {
  await db.message.deleteMany({})
  await db.conversation.deleteMany({})
  return NextResponse.json({ ok: true })
}
