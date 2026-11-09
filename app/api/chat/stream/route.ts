import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { buildSystemPrompt, chatStream, type ChatMessage } from '@/lib/ai'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const HISTORY_LIMIT = 30

/**
 * POST /api/chat/stream — real token-by-token streaming chat.
 * body: { conversationId?, message, language: 'fa'|'en', ownerName? }
 *
 * Protocol: NDJSON lines, one JSON object per line:
 *   {"type":"meta","conversationId":"...","title":"..."}
 *   {"type":"delta","content":"..."}        (many)
 *   {"type":"done","messageId":"...","createdAt":"..."}
 *   {"type":"error","message":"..."}
 *
 * Honesty rules (same as /api/chat): nothing is persisted until a real AI
 * reply exists; a failed stream leaves no half-written history.
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'invalid json' }, { status: 400 })
  }

  const message: string = (body.message ?? '').toString().trim()
  const language: 'fa' | 'en' = body.language === 'en' ? 'en' : 'fa'
  const ownerName: string | undefined = body.ownerName

  if (!message) {
    return Response.json({ error: 'message is required' }, { status: 400 })
  }
  if (message.length > 8000) {
    return Response.json({ error: 'message is too long (max 8000 chars)' }, { status: 400 })
  }

  // 1) Find or create the conversation (deleted again if the stream fails empty)
  let conversation = body.conversationId
    ? await db.conversation.findUnique({ where: { id: body.conversationId } })
    : null
  let created = false
  if (!conversation) {
    const title = message.replace(/\s+/g, ' ').slice(0, 48) + (message.length > 48 ? '…' : '')
    conversation = await db.conversation.create({ data: { title, language } })
    created = true
  }

  // 2) Recent history for context
  const history = await db.message.findMany({
    where: { conversationId: conversation.id },
    orderBy: { createdAt: 'asc' },
    take: HISTORY_LIMIT,
  })

  const messages: ChatMessage[] = [
    { role: 'assistant', content: buildSystemPrompt(language, ownerName) },
    ...history.map((m) => ({
      role: m.role === 'user' ? ('user' as const) : ('assistant' as const),
      content: m.content,
    })),
    { role: 'user', content: message },
  ]

  const enc = new TextEncoder()

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(enc.encode(JSON.stringify(obj) + '\n'))

      send({ type: 'meta', conversationId: conversation!.id, title: conversation!.title })

      let full = ''
      let failed = false

      try {
        // Unified streaming: works with the built-in SDK and any
        // OpenAI-compatible provider configured via env (AI_BASE_URL/AI_API_KEY).
        const upstream = await chatStream(messages)

        const reader = upstream.getReader()
        const dec = new TextDecoder()
        let buf = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buf += dec.decode(value, { stream: true })
          const lines = buf.split('\n')
          buf = lines.pop() ?? ''
          for (const line of lines) {
            const t = line.trim()
            if (!t.startsWith('data:')) continue
            const payload = t.slice(5).trim()
            if (!payload || payload === '[DONE]') continue
            try {
              const j = JSON.parse(payload) as {
                choices?: { delta?: { content?: string } }[]
              }
              const delta = j?.choices?.[0]?.delta?.content
              if (delta) {
                full += delta
                send({ type: 'delta', content: delta })
              }
            } catch {
              /* partial SSE line — skip */
            }
          }
        }

        if (!full.trim()) throw new Error('Empty response from AI model')
      } catch (err) {
        failed = true
        const detail = err instanceof Error ? err.message : String(err)
        send({
          type: 'error',
          message:
            language === 'fa'
              ? 'ارتباط با مدل هوش مصنوعی برقرار نشد. لطفاً دوباره تلاش کن.'
              : 'Could not reach the AI model. Please try again.',
          detail,
        })
      }

      if (!failed && full.trim()) {
        // 3) Persist both messages now that a real reply streamed through
        try {
          await db.message.create({
            data: { conversationId: conversation!.id, role: 'user', content: message },
          })
          const saved = await db.message.create({
            data: { conversationId: conversation!.id, role: 'assistant', content: full },
          })
          await db.conversation.update({
            where: { id: conversation!.id },
            data: { updatedAt: new Date() },
          })
          send({ type: 'done', messageId: saved.id, createdAt: saved.createdAt })
        } catch (err) {
          send({
            type: 'error',
            message: language === 'fa' ? 'خطا در ذخیره پیام‌ها.' : 'Failed to save messages.',
            detail: err instanceof Error ? err.message : String(err),
          })
        }
      } else if (failed && created && history.length === 0) {
        // honest failure: drop the empty conversation we just created
        await db.conversation.delete({ where: { id: conversation!.id } }).catch(() => {})
      }

      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  })
}
