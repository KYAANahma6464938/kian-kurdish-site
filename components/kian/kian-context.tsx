'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { getDict, type Dict, type Language } from '@/lib/i18n'

type KianCtx = {
  language: Language
  setLanguage: (l: Language) => void
  ownerName: string
  setOwnerName: (n: string) => void
  t: Dict
}

const Ctx = createContext<KianCtx | null>(null)

export function KianProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>('fa')
  const [ownerName, setOwnerNameState] = useState('')

  // hydrate from localStorage after mount (SSR-safe two-pass render)
  useEffect(() => {
    try {
      const l = localStorage.getItem('kian-language')
      // eslint-disable-next-line react-hooks/set-state-in-effect -- read-once hydration from localStorage
      if (l === 'fa' || l === 'en') setLanguageState(l)
      setOwnerNameState(localStorage.getItem('kian-owner') ?? '')
    } catch {
      /* private mode */
    }
  }, [])

  useEffect(() => {
    const dict = getDict(language)
    document.documentElement.lang = language
    document.documentElement.dir = dict.dir
  }, [language])

  const setLanguage = (l: Language) => {
    setLanguageState(l)
    try {
      localStorage.setItem('kian-language', l)
    } catch {}
  }

  const setOwnerName = (n: string) => {
    setOwnerNameState(n)
    try {
      localStorage.setItem('kian-owner', n)
    } catch {}
  }

  return (
    <Ctx.Provider value={{ language, setLanguage, ownerName, setOwnerName, t: getDict(language) }}>
      {children}
    </Ctx.Provider>
  )
}

export function useKian(): KianCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useKian must be used inside KianProvider')
  return ctx
}
