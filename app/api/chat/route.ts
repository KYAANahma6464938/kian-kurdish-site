import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { buildSystemPrompt, chatComplete, type ChatMessage } from '@/lib/ai'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const HISTORY_LIMIT = 30

/**
 * POST /api/chat
 * body: { conversationId?, message, language: 'fa'|'en', ownerName? }
 * Both messages are persisted only after a real AI reply arrives, so a failed
 * request leaves no half-written history and "retry" never duplicates messages.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const message: string = (body.message ?? '').toString().trim()
    const language: 'fa' | 'en' = body.language === 'en' ? 'en' : 'fa'
    const ownerName: string | undefined = body.ownerName

    if (!message) {
      return NextResponse.json({ error: 'message is required' }, { status: 400 })
    }
    if (message.length > 8000) {
      return NextResponse.json({ error: 'message is too long (max 8000 chars)' }, { status: 400 })
    }

    // 1) Find or create the conversation
    let conversation = body.conversationId
      ? await db.conversation.findUnique({ where: { id: body.conversationId } })
      : null
    let created = false
    if (!conversation) {
      const title = message.replace(/\s+/g, ' ').slice(0, 48) + (message.length > 48 ? '…' : '')
      conversation = await db.conversation.create({ data: { title, language } })
      created = true
    }

    // 2) Load recent history for context
    const history = await db.message.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: 'asc' },
      take: HISTORY_LIMIT,
    })

    // 3) Real AI call (server-side only — credentials never leave the backend)
    const messages: ChatMessage[] = [
      { role: 'assistant', content: buildSystemPrompt(language, ownerName) },
      ...history.map((m) => ({
        role: m.role === 'user' ? ('user' as const) : ('assistant' as const),
        content: m.content,
      })),
      { role: 'user', content: message },
    ]

    let reply: string
    try {
      reply = await chatComplete(messages)
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err)
      // Honest failure: keep nothing half-written; drop an empty new conversation.
      if (created && history.length === 0) {
        await db.conversation.delete({ where: { id: conversation.id } }).catch(() => {})
      }
      return NextResponse.json(
        {
          error: 'AI_REQUEST_FAILED',
          detail,
          conversationId: created ? null : conversation.id,
          message:
            language === 'fa'
              ? 'ارتباط با مدل هوش مصنوعی برقرار نشد. لطفاً دوباره تلاش کن.'
              : 'Could not reach the AI model. Please try again.',
        },
        { status: 502 }
      )
    }

    // 4) Persist both messages now that the reply really exists
    await db.message.create({
      data: { conversationId: conversation.id, role: 'user', content: message },
    })
    const saved = await db.message.create({
      data: { conversationId: conversation.id, role: 'assistant', content: reply },
    })
    await db.conversation.update({
      where: { id: conversation.id },
      data: { updatedAt: new Date() },
    })

    return NextResponse.json({
      conversationId: conversation.id,
      title: conversation.title,
      reply: { id: saved.id, role: 'assistant', content: reply, createdAt: saved.createdAt },
    })
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: 'SERVER_ERROR', detail }, { status: 500 })
  }
}
