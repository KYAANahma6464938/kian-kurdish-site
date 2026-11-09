'use client'

import { useEffect, useRef } from 'react'

/**
 * Lightweight code editor: line numbers + mono LTR textarea with Tab support.
 * Reliable, zero-dependency, and fully keyboard accessible.
 */
export function CodeEditor({
  value,
  onChange,
  onSave,
  readOnly = false,
}: {
  value: string
  onChange: (v: string) => void
  onSave?: () => void
  readOnly?: boolean
}) {
  const taRef = useRef<HTMLTextAreaElement>(null)
  const gutterRef = useRef<HTMLDivElement>(null)
  const lineCount = value.split('\n').length

  useEffect(() => {
    const ta = taRef.current
    if (!ta || !onSave) return
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        onSave()
      }
    }
    ta.addEventListener('keydown', handler)
    return () => ta.removeEventListener('keydown', handler)
  }, [onSave])

  const syncScroll = () => {
    if (gutterRef.current && taRef.current) {
      gutterRef.current.scrollTop = taRef.current.scrollTop
    }
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault()
      const ta = e.currentTarget
      const start = ta.selectionStart
      const end = ta.selectionEnd
      const next = value.slice(0, start) + '  ' + value.slice(end)
      onChange(next)
      requestAnimationFrame(() => {
        ta.selectionStart = ta.selectionEnd = start + 2
      })
    }
  }

  return (
    <div className="relative flex h-full min-h-0 overflow-hidden rounded-xl border border-border bg-[#0a0a12]" dir="ltr">
      {/* line numbers */}
      <div
        ref={gutterRef}
        className="kian-scroll w-12 shrink-0 select-none overflow-hidden border-e border-white/5 bg-white/[0.02] py-3 text-right"
        aria-hidden="true"
      >
        {Array.from({ length: lineCount }, (_, i) => (
          <div key={i} className="ltr-mono px-2 text-[11px] leading-[1.7] text-white/20">
            {i + 1}
          </div>
        ))}
      </div>
      <textarea
        ref={taRef}
        value={value}
        readOnly={readOnly}
        onChange={(e) => onChange(e.target.value)}
        onScroll={syncScroll}
        onKeyDown={onKeyDown}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        className="ltr-mono kian-scroll h-full min-h-0 w-full resize-none bg-transparent py-3 pe-4 text-[12.5px] leading-[1.7] text-[#e8e4f6] outline-none placeholder:text-white/20"
        aria-label="Code editor"
      />
    </div>
  )
}
