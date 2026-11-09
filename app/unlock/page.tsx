'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { KeyRound, Languages, Loader2, LockKeyhole, ShieldCheck } from 'lucide-react'

/**
 * /unlock — the gate shown when KIAN_ACCESS_PASSWORD is set on the server.
 * Bilingual (Persian default + English toggle), matching the KIAN premium look.
 */
export default function UnlockPage() {
  const [lang, setLang] = useState<'fa' | 'en'>('fa')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dir = lang === 'fa' ? 'rtl' : 'ltr'

  const s =
    lang === 'fa'
      ? {
          title: 'KIAN AI قفل است',
          sub: 'این دستیار شخصی است — برای ورود، رمز دسترسی را وارد کن.',
          placeholder: 'رمز دسترسی',
          button: 'باز کردن قفل',
          wrong: 'رمز اشتباه است — دوباره تلاش کن.',
          hint: 'رمز در متغیر محیطی KIAN_ACCESS_PASSWORD سرور تنظیم می‌شود.',
        }
      : {
          title: 'KIAN AI is locked',
          sub: 'This is a personal assistant — enter the access password to continue.',
          placeholder: 'Access password',
          button: 'Unlock',
          wrong: 'Wrong password — try again.',
          hint: 'The password is set via the KIAN_ACCESS_PASSWORD server env var.',
        }

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!password.trim() || busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/auth/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      if (res.ok) {
        window.location.href = '/'
        return
      }
      setError(s.wrong)
    } catch {
      setError(s.wrong)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="relative flex h-dvh items-center justify-center overflow-hidden bg-background px-4"
      dir={dir}
    >
      {/* ambient background */}
      <div className="kian-aurora pointer-events-none absolute inset-0" aria-hidden="true" />
      <div className="kian-aurora-mid" aria-hidden="true" />
      <div className="kian-grid-overlay" aria-hidden="true" />
      <div className="kian-vignette pointer-events-none absolute inset-0" aria-hidden="true" />

      <motion.div
        initial={{ opacity: 0, y: 18, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', damping: 24, stiffness: 260 }}
        className="kian-glass kian-ring-glow relative z-10 w-full max-w-sm rounded-3xl p-7"
      >
        {/* logo */}
        <div className="mb-5 flex flex-col items-center gap-3 text-center">
          <div className="relative">
            <span
              className="animate-spin-slow absolute -inset-1.5 rounded-3xl bg-[conic-gradient(from_0deg,var(--gold),var(--purple),transparent_55%,var(--gold))] opacity-80 blur-[2px]"
              aria-hidden="true"
            />
            <div className="kian-logo animate-glow-pulse relative flex h-14 w-14 rotate-45 items-center justify-center rounded-2xl shadow-xl">
              <span className="-rotate-45 text-2xl font-black text-black">K</span>
            </div>
          </div>
          <h1 className="kian-gradient-text kian-title-glow text-2xl font-black tracking-[0.12em]">KIAN AI</h1>
        </div>

        <div className="mb-4 flex items-center justify-center gap-2 text-sm font-bold">
          <LockKeyhole className="h-4 w-4 text-gold" />
          <span>{s.title}</span>
        </div>
        <p className="mb-5 text-center text-xs leading-5 text-muted-foreground">{s.sub}</p>

        <form onSubmit={submit} className="space-y-3">
          <div className="relative">
            <KeyRound className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={s.placeholder}
              autoFocus
              className="w-full rounded-2xl border border-border bg-input/40 py-3 pe-4 ps-10 text-sm outline-none transition-all placeholder:text-muted-foreground/60 focus:border-gold/50 focus:ring-2 focus:ring-gold/20"
            />
          </div>

          {error ? (
            <motion.p
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
            >
              {error}
            </motion.p>
          ) : null}

          <button
            type="submit"
            disabled={busy || !password.trim()}
            className="kian-send flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-l from-gold to-gold-bright py-3 text-sm font-extrabold text-black shadow-lg transition-all hover:opacity-90 disabled:opacity-40"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            {s.button}
          </button>
        </form>

        <p className="mt-4 text-center text-[10px] leading-4 text-muted-foreground/70">{s.hint}</p>

        <button
          onClick={() => setLang(lang === 'fa' ? 'en' : 'fa')}
          className="mx-auto mt-4 flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[11px] text-muted-foreground transition-colors hover:border-gold/40 hover:text-gold"
        >
          <Languages className="h-3 w-3" />
          {lang === 'fa' ? 'English' : 'فارسی'}
        </button>
      </motion.div>
    </div>
  )
}
