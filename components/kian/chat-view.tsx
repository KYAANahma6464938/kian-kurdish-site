'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Loader2, MessageSquarePlus, SendHorizonal, Sparkles, Trash2, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useKian } from './kian-context'
import { Markdown } from './markdown'
import type { ChatMsg, ConversationDetail, ConversationItem } from '@/lib/types'

export function ChatView() {
  const { t, language, ownerName } = useKian()
  const [conversations, setConversations] = useState<ConversationItem[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [loadingList, setLoadingList] = useState(true)
  const [showHistory, setShowHistory] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const loadConversations = useCallback(async () => {
    try {
      const res = await fetch('/api/conversations')
      const data = await res.json()
      setConversations(data.conversations ?? [])
    } catch {
      /* offline */
    } finally {
      setLoadingList(false)
    }
  }, [])

  useEffect(() => {
    loadConversations()
  }, [loadConversations])

  const openConversation = useCallback(async (id: string) => {
    setShowHistory(false)
    try {
      const res = await fetch(`/api/conversations/${id}`)
      if (!res.ok) return
      const data = (await res.json()) as { conversation: ConversationDetail }
      setActiveId(id)
      setMessages(data.conversation.messages)
    } catch {
      /* ignore */
    }
  }, [])

  const newChat = () => {
    setActiveId(null)
    setMessages([])
    setShowHistory(false)
    textareaRef.current?.focus()
  }

  const deleteConversation = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!window.confirm(t.chat.confirmDelete)) return
    await fetch(`/api/conversations/${id}`, { method: 'DELETE' })
    if (activeId === id) newChat()
    loadConversations()
  }

  /**
   * Real streaming send: the answer arrives token-by-token from the server
   * and is rendered live while it streams. Nothing is faked — if the stream
   * errors mid-way, the honest error state is shown.
   */
  const send = async (text?: string) => {
    const content = (text ?? input).trim()
    if (!content || sending) return
    setInput('')
    setSending(true)
    const tempUserId = `tmp-u-${Date.now()}`
    const tempAiId = `tmp-a-${Date.now()}`
    setMessages((m) => [
      ...m,
      { id: tempUserId, role: 'user', content, createdAt: new Date().toISOString() },
      { id: tempAiId, role: 'assistant', content: '', createdAt: new Date().toISOString(), pending: true },
    ])

    const fail = (detail: string) =>
      setMessages((m) =>
        m.map((msg) => (msg.id === tempAiId ? { ...msg, pending: false, streaming: false, error: detail } : msg))
      )

    try {
      const res = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: activeId, message: content, language, ownerName }),
      })
      if (!res.ok || !res.body) {
        let msg = t.chat.errorNetwork
        try {
          const j = await res.json()
          msg = j.message || j.detail || msg
        } catch {
          /* non-json error */
        }
        throw new Error(msg)
      }

      const reader = res.body.getReader()
      const dec = new TextDecoder()
      let buf = ''
      let streamError: string | null = null
      let finalized = false

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() ?? ''
        for (const line of lines) {
          const s = line.trim()
          if (!s) continue
          let ev: {
            type: string
            conversationId?: string
            content?: string
            messageId?: string
            createdAt?: string
            message?: string
          }
          try {
            ev = JSON.parse(s)
          } catch {
            continue
          }
          if (ev.type === 'meta' && ev.conversationId && !activeId) {
            setActiveId(ev.conversationId)
          } else if (ev.type === 'delta' && ev.content) {
            setMessages((m) =>
              m.map((msg) =>
                msg.id === tempAiId
                  ? { ...msg, pending: false, streaming: true, content: msg.content + ev.content }
                  : msg
              )
            )
          } else if (ev.type === 'done' && ev.messageId) {
            finalized = true
            setMessages((m) =>
              m.map((msg) =>
                msg.id === tempAiId
                  ? {
                      id: ev.messageId!,
                      role: 'assistant' as const,
                      content: msg.content,
                      createdAt: ev.createdAt ?? new Date().toISOString(),
                      streaming: false,
                    }
                  : msg
              )
            )
          } else if (ev.type === 'error') {
            streamError = ev.message || t.chat.errorNetwork
          }
        }
      }

      if (streamError) throw new Error(streamError)
      if (!finalized && !streamError) {
        // stream ended without a proper done event
        setMessages((m) =>
          m.map((msg) =>
            msg.id === tempAiId && msg.content.trim()
              ? { ...msg, streaming: false }
              : msg
          )
        )
      }
      loadConversations()
    } catch (err) {
      fail(err instanceof Error ? err.message : t.chat.errorNetwork)
    } finally {
      setSending(false)
      textareaRef.current?.focus()
    }
  }

  const retry = () => {
    // drop the error bubble + its user message, then re-send that text
    const errIdx = messages.findIndex((m) => m.error)
    if (errIdx <= 0) return
    const content = messages[errIdx - 1]?.content
    setMessages((m) => m.slice(0, errIdx - 1))
    if (content) void send(content)
  }

  // auto-scroll — scroll the messages container itself (scrollIntoView would
  // also programmatically scroll overflow-hidden ancestors and shift the layout)
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [messages, sending])

  // textarea auto-resize
  const onInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = Math.min(e.target.scrollHeight, 160) + 'px'
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  return (
    <div className="flex h-full min-h-0" dir={t.dir}>
      {/* History panel — desktop */}
      <aside className="hidden w-64 shrink-0 flex-col border-e border-border/60 bg-sidebar/60 lg:flex">
        <div className="p-3">
          <Button
            onClick={newChat}
            className="kian-send w-full gap-2 bg-gradient-to-l from-gold to-gold-bright font-semibold text-black hover:opacity-90"
          >
            <MessageSquarePlus className="h-4 w-4" />
            {t.chat.newChat}
          </Button>
        </div>
        <ConversationList
          items={conversations}
          activeId={activeId}
          loading={loadingList}
          onOpen={openConversation}
          onDelete={deleteConversation}
          labels={t}
        />
      </aside>

      {/* History panel — mobile drawer */}
      <AnimatePresence>
        {showHistory && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/60 lg:hidden"
            onClick={() => setShowHistory(false)}
          >
            <motion.div
              initial={{ x: t.dir === 'rtl' ? 300 : -300 }}
              animate={{ x: 0 }}
              exit={{ x: t.dir === 'rtl' ? 300 : -300 }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              className="absolute inset-y-0 start-0 flex w-72 flex-col bg-card p-3"
              onClick={(e) => e.stopPropagation()}
            >
              <Button
                onClick={newChat}
                className="mb-3 w-full gap-2 bg-gradient-to-l from-gold to-gold-bright font-semibold text-black hover:opacity-90"
              >
                <MessageSquarePlus className="h-4 w-4" />
                {t.chat.newChat}
              </Button>
              <ConversationList
                items={conversations}
                activeId={activeId}
                loading={loadingList}
                onOpen={openConversation}
                onDelete={deleteConversation}
                labels={t}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Chat pane */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* top bar (mobile) */}
        <div className="flex items-center gap-2 border-b border-border/60 p-2 lg:hidden">
          <Button variant="outline" size="sm" onClick={() => setShowHistory(true)}>
            {t.chat.conversations}
          </Button>
          <Button variant="outline" size="sm" onClick={newChat}>
            <MessageSquarePlus className="h-4 w-4" />
          </Button>
        </div>

        {/* messages */}
        <div ref={scrollRef} className="kian-scroll min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-6">
          {messages.length === 0 ? (
            <div className="mx-auto flex h-full max-w-2xl flex-col items-center justify-center text-center">
              {/* orbiting sparkles hero */}
              <div className="relative mb-5 flex h-24 w-24 items-center justify-center">
                <span className="kian-logo animate-glow-pulse absolute inset-0 rotate-45 rounded-3xl" />
                <span className="kian-orbit absolute inset-[-14px] border border-dashed border-gold/35">
                  <span className="kian-orbit-dot" />
                </span>
                <span className="kian-orbit kian-orbit-rev absolute inset-[-24px] border border-dashed border-purple/30">
                  <span className="kian-orbit-dot kian-orbit-dot-purple" />
                </span>
                <span className="relative -rotate-45 text-3xl font-black text-black">K</span>
              </div>
              <h2 className="kian-gradient-text text-2xl font-extrabold sm:text-3xl">{t.chat.emptyTitle}</h2>
              <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">{t.chat.emptySub}</p>
              <p className="mt-1 text-xs text-muted-foreground/70">{t.chat.langNote}</p>
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                {t.chat.quick.map((q) => (
                  <button
                    key={q}
                    onClick={() => send(q)}
                    className="rounded-full border border-gold/30 bg-gold/5 px-3.5 py-2 text-xs text-foreground/90 transition-all hover:border-gold/60 hover:bg-gold/15 hover:-translate-y-0.5"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mx-auto max-w-3xl space-y-4">
              {messages.map((m) => (
                <motion.div
                  key={m.id}
                  initial={{ opacity: 0, y: 8, scale: 0.985 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ type: 'spring', damping: 26, stiffness: 320 }}
                  className={`flex gap-2.5 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}
                >
                  <div
                    className={`mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border ${
                      m.role === 'user'
                        ? 'border-white/10 bg-white/5'
                        : 'kian-logo border-transparent shadow-[0_0_14px_color-mix(in_oklab,var(--gold)_45%,transparent)]'
                    }`}
                  >
                    {m.role === 'user' ? (
                      <User className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <span className="text-xs font-extrabold text-black">K</span>
                    )}
                  </div>
                  <div className={`max-w-[85%] sm:max-w-[75%] ${m.role === 'user' ? 'text-end' : ''}`}>
                    <div className="mb-1 text-[11px] text-muted-foreground">
                      {m.role === 'user' ? t.chat.you : t.appName}
                    </div>
                    <div
                      className={`inline-block rounded-2xl px-4 py-3 text-start ${
                        m.role === 'user'
                          ? 'kian-bubble-user rounded-ts-sm border border-gold/25'
                          : `rounded-te-sm border bg-card ${m.streaming ? 'kian-bubble-live border-gold/30' : 'border-border'}`
                      } ${m.error ? 'border-destructive/50 bg-destructive/10' : ''}`}
                    >
                      {m.pending ? (
                        <SearchingBubble label={t.chat.thinking} phrases={t.chat.thinkingSteps} />
                      ) : m.error ? (
                        <div className="text-sm text-destructive">
                          {m.content ? (
                            <div className="mb-2 opacity-60">
                              <Markdown content={m.content} />
                            </div>
                          ) : null}
                          <p className="font-semibold">{t.common.error}</p>
                          <p className="mt-1 text-xs leading-5 opacity-90">{m.error}</p>
                          <button
                            onClick={retry}
                            className="mt-2 rounded-md border border-destructive/40 px-2 py-1 text-xs text-destructive hover:bg-destructive/20"
                          >
                            {t.chat.retry}
                          </button>
                        </div>
                      ) : m.role === 'user' ? (
                        <p className="whitespace-pre-wrap text-sm leading-6">{m.content}</p>
                      ) : (
                        <div className="kian-stream-wrap">
                          <Markdown content={m.content} />
                          {m.streaming ? <span className="kian-caret" aria-hidden="true" /> : null}
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>

        {/* composer */}
        <div className="border-t border-border/60 bg-card/40 p-3 sm:p-4">
          <div className="mx-auto flex max-w-3xl items-end gap-2">
            <div className="kian-composer relative flex-1">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={onInput}
                onKeyDown={onKeyDown}
                placeholder={t.chat.placeholder}
                rows={1}
                className="kian-scroll max-h-40 w-full resize-none rounded-2xl border border-border bg-input/40 px-4 py-3 text-sm leading-6 outline-none transition-all placeholder:text-muted-foreground/60 focus:border-gold/50 focus:ring-2 focus:ring-gold/20"
                aria-label={t.chat.placeholder}
              />
            </div>
            <Button
              onClick={() => send()}
              disabled={sending || !input.trim()}
              size="icon"
              className="kian-send h-11 w-11 shrink-0 rounded-2xl bg-gradient-to-br from-purple to-gold text-white shadow-lg transition-all hover:scale-105 hover:opacity-95 disabled:opacity-40"
              aria-label={t.nav.chat}
            >
              {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <SendHorizonal className="h-5 w-5 rtl:-scale-x-100" />}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Fancy "searching for the answer" indicator:
 * radar rings + rotating conic core + shimmering gold label + scanning bar
 * + rotating status phrases.
 */
function SearchingBubble({ label, phrases }: { label: string; phrases: readonly string[] }) {
  const [idx, setIdx] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setIdx((i) => (i + 1) % phrases.length), 1900)
    return () => clearInterval(id)
  }, [phrases])

  return (
    <div className="flex items-center gap-3 py-1">
      {/* radar avatar: expanding rings + spinning conic core */}
      <div className="relative flex h-11 w-11 shrink-0 items-center justify-center">
        <span className="kian-radar absolute inset-0 rounded-full border border-gold/50" />
        <span className="kian-radar kian-radar-late absolute inset-0 rounded-full border border-purple/40" />
        <span className="animate-spin-slow absolute inset-[5px] rounded-full bg-[conic-gradient(from_0deg,var(--gold),var(--purple),var(--gold-bright),var(--purple-deep),var(--gold))]" />
        <span className="absolute inset-[8px] rounded-full bg-card" />
        <Sparkles className="animate-glow-pulse relative h-4 w-4 text-gold" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="kian-shimmer-text text-sm font-extrabold">{label}</span>
          <span className="flex gap-1 pb-0.5">
            <span className="typing-dot" />
            <span className="typing-dot" />
            <span className="typing-dot" />
          </span>
        </div>
        {/* scanning bar */}
        <div className="kian-scan mt-1.5 h-1 w-40 overflow-hidden rounded-full bg-border/60" />
        <AnimatePresence mode="wait">
          <motion.span
            key={idx}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.22 }}
            className="mt-1 block text-[11px] text-muted-foreground"
          >
            {phrases[idx]}
          </motion.span>
        </AnimatePresence>
      </div>
    </div>
  )
}

function ConversationList({
  items,
  activeId,
  loading,
  onOpen,
  onDelete,
  labels,
}: {
  items: ConversationItem[]
  activeId: string | null
  loading: boolean
  onOpen: (id: string) => void
  onDelete: (id: string, e: React.MouseEvent) => void
  labels: ReturnType<typeof useKian>['t']
}) {
  return (
    <ScrollArea className="min-h-0 flex-1 px-3 pb-3">
      <p className="mb-2 px-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {labels.chat.conversations}
      </p>
      {loading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-4 w-4 animate-spin text-gold" />
        </div>
      ) : items.length === 0 ? (
        <p className="px-1 py-4 text-xs text-muted-foreground">{labels.chat.emptyHistory}</p>
      ) : (
        <div className="space-y-1">
          {items.map((c) => (
            <div
              key={c.id}
              onClick={() => onOpen(c.id)}
              className={`group flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm transition-colors ${
                activeId === c.id
                  ? 'border border-gold/30 bg-gold/10 text-foreground'
                  : 'border border-transparent hover:bg-white/5'
              }`}
            >
              <Sparkles className={`h-3.5 w-3.5 shrink-0 ${activeId === c.id ? 'text-gold' : 'text-muted-foreground/50'}`} />
              <span className="min-w-0 flex-1 truncate">{c.title}</span>
              <button
                onClick={(e) => onDelete(c.id, e)}
                className="opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                aria-label={labels.chat.deleteChat}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </ScrollArea>
  )
}
