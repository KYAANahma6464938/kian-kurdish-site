'use client'

import { memo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { Check, Copy } from 'lucide-react'
import { useKian } from './kian-context'

/** Code block with a copy button — always LTR. */
function CodeBlock({ code, lang }: { code: string; lang?: string }) {
  const { t } = useKian()
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <div className="group relative my-3 overflow-hidden rounded-xl border border-white/10 bg-[#0b0b13]">
      <div className="flex items-center justify-between border-b border-white/10 bg-white/[0.03] px-3 py-1.5">
        <span className="ltr-mono text-[11px] uppercase tracking-wider text-gold">{lang || 'code'}</span>
        <button
          onClick={copy}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
          aria-label={t.common.copy}
        >
          {copied ? <Check className="h-3 w-3 text-gold" /> : <Copy className="h-3 w-3" />}
          {copied ? t.common.copied : t.common.copy}
        </button>
      </div>
      <pre className="ltr-mono kian-scroll overflow-x-auto p-4 text-[12.5px] leading-relaxed text-[#e6e1f5]">
        <code>{code}</code>
      </pre>
    </div>
  )
}

/** Markdown renderer tuned for the chat bubbles. */
export const Markdown = memo(function Markdown({ content }: { content: string }) {
  return (
    <div className="text-[14.5px] leading-7 [&_a]:text-gold [&_a]:underline [&_blockquote]:border-s-2 [&_blockquote]:border-gold/40 [&_blockquote]:ps-3 [&_blockquote]:italic [&_h1]:mb-2 [&_h1]:text-lg [&_h1]:font-bold [&_h2]:mb-2 [&_h2]:text-base [&_h2]:font-bold [&_h3]:mb-1 [&_h3]:font-semibold [&_li]:ms-1 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:ps-5 [&_p]:my-2 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0 [&_strong]:text-gold [&_strong]:font-semibold [&_ul]:my-2 [&_ul]:list-disc [&_ul]:ps-5">
      <ReactMarkdown
        components={{
          pre: ({ children }) => <>{children}</>,
          code: ({ className, children, ...props }) => {
            const text = String(children ?? '').replace(/\n$/, '')
            const match = /language-(\w+)/.exec(className || '')
            const isBlock = text.includes('\n') || !!match
            if (!isBlock) {
              return (
                <code
                  className="ltr-mono rounded-md border border-gold/20 bg-gold/10 px-1.5 py-0.5 text-[0.85em] text-gold"
                  {...props}
                >
                  {text}
                </code>
              )
            }
            return <CodeBlock code={text} lang={match?.[1]} />
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
})
