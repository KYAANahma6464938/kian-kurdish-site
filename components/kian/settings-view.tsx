'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Database,
  Globe,
  Info,
  Loader2,
  LockKeyhole,
  Moon,
  RefreshCw,
  ShieldCheck,
  Sun,
  Trash2,
  User,
  XCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useKian } from './kian-context'
import type { AuthStatus, Health } from '@/lib/types'

export function SettingsView() {
  const { t, language, setLanguage, ownerName, setOwnerName } = useKian()
  const { setTheme } = useTheme()
  const [health, setHealth] = useState<Health | null>(null)
  const [auth, setAuth] = useState<AuthStatus | null>(null)
  const [checking, setChecking] = useState(true)
  const [name, setName] = useState(ownerName)

  const checkHealth = useCallback(async () => {
    setChecking(true)
    try {
      const [hRes, aRes] = await Promise.all([fetch('/api/health'), fetch('/api/auth/status')])
      setHealth(await hRes.json())
      setAuth(await aRes.json())
    } catch {
      setHealth(null)
      setAuth(null)
    } finally {
      setChecking(false)
    }
  }, [])

  useEffect(() => {
    checkHealth()
  }, [checkHealth])

  const wipeChats = async () => {
    if (!window.confirm(t.settings.confirmWipeChats)) return
    await fetch('/api/conversations', { method: 'DELETE' })
  }

  const wipeProjects = async () => {
    if (!window.confirm(t.settings.confirmWipeProjects)) return
    await fetch('/api/projects', { method: 'DELETE' })
  }

  const saveName = () => {
    setOwnerName(name)
  }

  return (
    <div className="kian-scroll h-full overflow-y-auto p-4 sm:p-6" dir={t.dir}>
      <div className="mx-auto max-w-2xl space-y-4">
        <h1 className="text-xl font-extrabold sm:text-2xl">{t.settings.title}</h1>

        {/* preferences */}
        <section className="kian-glass rounded-2xl p-4 sm:p-5">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-bold">
            <Globe className="h-4 w-4 text-gold" />
            {t.settings.language} · {t.settings.theme}
          </h2>

          <div className="mb-5">
            <p className="mb-2 text-xs font-medium text-muted-foreground">{t.settings.language}</p>
            <div className="flex gap-2">
              {(
                [
                  ['fa', 'فارسی'],
                  ['en', 'English'],
                ] as const
              ).map(([code, label]) => (
                <button
                  key={code}
                  onClick={() => setLanguage(code)}
                  className={`flex-1 rounded-xl border px-4 py-2.5 text-sm transition-all ${
                    language === code
                      ? 'border-gold bg-gold/10 font-bold text-gold'
                      : 'border-border text-muted-foreground hover:border-gold/40'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">{t.settings.theme}</p>
            <div className="flex gap-2">
              <button
                onClick={() => setTheme('dark')}
                className={`flex flex-1 items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm transition-all ${
                  'border-border text-muted-foreground hover:border-gold/40 dark:border-gold dark:bg-gold/10 dark:font-bold dark:text-gold'
                }`}
              >
                <Moon className="h-4 w-4" />
                {t.settings.dark}
              </button>
              <button
                onClick={() => setTheme('light')}
                className={`flex flex-1 items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm transition-all ${
                  'border-gold bg-gold/10 font-bold text-gold dark:border-border dark:bg-transparent dark:font-normal dark:text-muted-foreground dark:hover:border-gold/40'
                }`}
              >
                <Sun className="h-4 w-4" />
                {t.settings.light}
              </button>
            </div>
          </div>
        </section>

        {/* owner */}
        <section className="kian-glass rounded-2xl p-4 sm:p-5">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold">
            <User className="h-4 w-4 text-gold" />
            {t.settings.ownerName}
          </h2>
          <div className="flex gap-2">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t.settings.ownerNamePlaceholder}
              className="bg-input/40"
            />
            <Button onClick={saveName} className="shrink-0 bg-gold font-bold text-black hover:bg-gold-bright">
              {t.common.confirm}
            </Button>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">{t.settings.ownerNote}</p>
        </section>

        {/* system status */}
        <section className="kian-glass rounded-2xl p-4 sm:p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-bold">
              <ShieldCheck className="h-4 w-4 text-gold" />
              {t.settings.systemStatus}
            </h2>
            <Button variant="outline" size="sm" onClick={checkHealth} disabled={checking} className="h-7 gap-1 text-[11px]">
              {checking ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              {t.settings.recheck}
            </Button>
          </div>
          <div className="space-y-2">
            <StatusRow
              icon={<Database className="h-4 w-4" />}
              label={t.settings.database}
              state={checking ? 'checking' : health?.database ? 'ok' : 'down'}
              okText={t.settings.operational}
              downText={t.settings.down}
              checkingText={t.settings.checking}
            />
            <StatusRow
              icon={<Bot className="h-4 w-4" />}
              label={t.settings.aiModel}
              sub={
                health?.provider === 'custom' ? t.settings.providerCustom : t.settings.providerBuiltIn
              }
              state={checking ? 'checking' : health?.ai ? 'ok' : 'down'}
              okText={t.settings.operational}
              downText={t.settings.down}
              checkingText={t.settings.checking}
            />
            <StatusRow
              icon={<LockKeyhole className="h-4 w-4" />}
              label={t.settings.accessLock}
              state={checking ? 'checking' : auth?.locked ? 'ok' : 'info'}
              okText={t.settings.lockOn}
              downText={t.settings.lockOff}
              checkingText={t.settings.checking}
            />
          </div>
        </section>

        {/* API keys & features */}
        <section className="kian-glass rounded-2xl p-4 sm:p-5">
          <h2 className="mb-1 flex items-center gap-2 text-sm font-bold">
            <Info className="h-4 w-4 text-gold" />
            {t.settings.apiKeysTitle}
          </h2>
          <p className="mb-4 text-xs leading-5 text-muted-foreground">{t.settings.apiKeysIntro}</p>
          <div className="space-y-2">
            {t.settings.features.map((f) => (
              <div
                key={f.name}
                className={`rounded-xl border p-3 ${
                  f.status === 'ok' ? 'border-gold/25 bg-gold/5' : 'border-border bg-card/40'
                }`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  {f.status === 'ok' ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-gold" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 shrink-0 text-purple-soft" />
                  )}
                  <span className="text-sm font-semibold">{f.name}</span>
                  <div className="flex-1" />
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[10px] ${
                      f.status === 'ok'
                        ? 'border-gold/40 bg-gold/10 text-gold'
                        : 'border-purple/40 bg-purple/10 text-purple-soft'
                    }`}
                  >
                    {f.status === 'ok' ? t.settings.statusOk : t.settings.statusMissing}
                  </span>
                </div>
                <p className="mt-1 ps-6 text-[11px] leading-5 text-muted-foreground">{f.note}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 rounded-xl border border-purple/25 bg-purple/10 px-3 py-2 text-[11px] leading-5 text-purple-soft">
            {t.settings.selfHostNote}
          </p>
        </section>

        {/* data management */}
        <section className="kian-glass rounded-2xl border-destructive/20 p-4 sm:p-5">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold">
            <Trash2 className="h-4 w-4 text-destructive" />
            {t.settings.dataTitle}
          </h2>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={wipeChats} className="border-destructive/40 text-destructive hover:bg-destructive/10">
              {t.settings.wipeChats}
            </Button>
            <Button variant="outline" onClick={wipeProjects} className="border-destructive/40 text-destructive hover:bg-destructive/10">
              {t.settings.wipeProjects}
            </Button>
          </div>
        </section>

        {/* about */}
        <section className="kian-glass rounded-2xl p-4 sm:p-5">
          <h2 className="kian-gradient-text mb-2 text-lg font-extrabold">{t.appName}</h2>
          <p className="text-xs leading-6 text-muted-foreground">{t.settings.aboutText}</p>
        </section>
      </div>
    </div>
  )
}

function StatusRow({
  icon,
  label,
  sub,
  state,
  okText,
  downText,
  checkingText,
}: {
  icon: React.ReactNode
  label: string
  sub?: string
  state: 'ok' | 'down' | 'checking' | 'info'
  okText: string
  downText: string
  checkingText: string
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-border bg-card/40 px-3 py-2.5">
      <span className={state === 'ok' ? 'text-gold' : 'text-muted-foreground'}>{icon}</span>
      <span className="flex-1 text-sm">
        {label}
        {sub ? <span className="ms-1.5 text-[10px] text-muted-foreground">({sub})</span> : null}
      </span>
      {state === 'checking' ? (
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          {checkingText}
        </span>
      ) : state === 'ok' ? (
        <span className="flex items-center gap-1.5 text-xs font-semibold text-gold">
          <CheckCircle2 className="h-3.5 w-3.5" />
          {okText}
        </span>
      ) : state === 'info' ? (
        <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
          <Info className="h-3.5 w-3.5" />
          {downText}
        </span>
      ) : (
        <span className="flex items-center gap-1.5 text-xs font-semibold text-destructive">
          <XCircle className="h-3.5 w-3.5" />
          {downText}
        </span>
      )}
    </div>
  )
}
