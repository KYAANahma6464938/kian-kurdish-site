'use client'

import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Sparkles } from 'lucide-react'
import { useKian } from './kian-context'

/**
 * KIAN AI boot splash — a professional loading animation shown while the
 * app warms up (about 1.8s), then fades away. Real chat/API loading is
 * independent; this is pure entrance polish.
 */
export function BootSplash() {
  const { t } = useKian()
  const [show, setShow] = useState(true)
  const [step, setStep] = useState(0)

  useEffect(() => {
    const timers = [
      setTimeout(() => setStep(1), 550),
      setTimeout(() => setStep(2), 1100),
      setTimeout(() => setShow(false), 1800),
    ]
    return () => timers.forEach(clearTimeout)
  }, [])

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key="boot"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.05, filter: 'blur(8px)' }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden bg-background"
          aria-hidden="true"
        >
          {/* ambient glow */}
          <div className="kian-aurora pointer-events-none absolute inset-0" />
          <div className="kian-vignette pointer-events-none absolute inset-0" />

          <div className="relative flex flex-col items-center gap-5 px-6 text-center">
            {/* logo */}
            <motion.div
              initial={{ scale: 0.4, rotate: -135, opacity: 0 }}
              animate={{ scale: 1, rotate: 45, opacity: 1 }}
              transition={{ type: 'spring', damping: 14, stiffness: 160, delay: 0.05 }}
              className="relative"
            >
              <span className="animate-spin-slow absolute -inset-2 rounded-3xl bg-[conic-gradient(from_0deg,var(--gold),var(--purple),transparent_55%,var(--gold))] opacity-80 blur-[3px]" />
              <div className="kian-logo animate-glow-pulse relative flex h-20 w-20 rotate-45 items-center justify-center rounded-3xl shadow-2xl">
                <span className="-rotate-45 text-4xl font-black text-black">K</span>
              </div>
            </motion.div>

            {/* brand */}
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25, duration: 0.45 }}
              className="flex flex-col items-center gap-1.5"
            >
              <h1 className="kian-shimmer-text text-4xl font-black tracking-[0.14em]">KIAN AI</h1>
              <p className="text-xs text-muted-foreground">{t.tagline}</p>
            </motion.div>

            {/* progress */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.35 }}
              className="mt-2 flex w-56 flex-col items-center gap-2.5"
            >
              <div className="h-1 w-full overflow-hidden rounded-full bg-border/70">
                <motion.div
                  initial={{ width: '4%' }}
                  animate={{ width: '100%' }}
                  transition={{ duration: 1.55, ease: [0.3, 0.9, 0.4, 1], delay: 0.15 }}
                  className="h-full rounded-full bg-gradient-to-r from-gold via-purple to-gold-bright shadow-[0_0_12px_color-mix(in_oklab,var(--gold)_60%,transparent)]"
                />
              </div>
              <div className="flex min-h-4 items-center gap-1.5 text-[11px] text-muted-foreground">
                <Sparkles className="h-3 w-3 text-gold" />
                <AnimatePresence mode="wait">
                  <motion.span
                    key={step}
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                    transition={{ duration: 0.2 }}
                  >
                    {t.bootSteps[step]}
                  </motion.span>
                </AnimatePresence>
              </div>
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
