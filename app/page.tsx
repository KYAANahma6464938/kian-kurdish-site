'use client'

import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useTheme } from 'next-themes'
import { Bot, FolderKanban, Languages, Menu, MessageCircle, Moon, Settings, Sun, X } from 'lucide-react'
import { KianProvider, useKian } from '@/components/kian/kian-context'
import { ChatView } from '@/components/kian/chat-view'
import { WorkspaceView } from '@/components/kian/workspace-view'
import { AgentView } from '@/components/kian/agent-view'
import { SettingsView } from '@/components/kian/settings-view'
import { BootSplash } from '@/components/kian/boot-splash'

type View = 'chat' | 'workspace' | 'agent' | 'settings'

export default function Page() {
  return (
    <KianProvider>
      <BootSplash />
      <App />
    </KianProvider>
  )
}

function App() {
  const { t } = useKian()
  const [view, setView] = useState<View>('chat')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [autoOpenProjectId, setAutoOpenProjectId] = useState<string | null>(null)

  const openProjectFromAgent = (id: string) => {
    setAutoOpenProjectId(id)
    setView('workspace')
  }

  const navItems: { key: View; label: string; icon: React.ReactNode }[] = [
    { key: 'chat', label: t.nav.chat, icon: <MessageCircle className="h-4.5 w-4.5" /> },
    { key: 'workspace', label: t.nav.workspace, icon: <FolderKanban className="h-4.5 w-4.5" /> },
    { key: 'agent', label: t.nav.agent, icon: <Bot className="h-4.5 w-4.5" /> },
    { key: 'settings', label: t.nav.settings, icon: <Settings className="h-4.5 w-4.5" /> },
  ]

  const sidebar = (
    <SidebarContent
      view={view}
      setView={(v) => {
        setView(v)
        setDrawerOpen(false)
      }}
      navItems={navItems}
    />
  )

  return (
    <div className="relative flex h-dvh overflow-hidden bg-background">
      {/* ambient aurora glow (behind everything) */}
      <div className="kian-aurora pointer-events-none absolute inset-0 z-0" aria-hidden="true" />
      <div className="kian-aurora-mid z-0" aria-hidden="true" />
      <div className="kian-grid-overlay z-0" aria-hidden="true" />

      {/* desktop sidebar */}
      <aside className="relative z-10 hidden lg:block lg:w-60 lg:shrink-0 lg:border-e lg:border-border/60">{sidebar}</aside>

      {/* mobile drawer */}
      <AnimatePresence>
        {drawerOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 lg:hidden"
            onClick={() => setDrawerOpen(false)}
          >
            <motion.aside
              initial={{ x: t.dir === 'rtl' ? 280 : -280 }}
              animate={{ x: 0 }}
              exit={{ x: t.dir === 'rtl' ? 280 : -280 }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              className="absolute inset-y-0 start-0 w-64 border-e border-border/60 bg-sidebar"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setDrawerOpen(false)}
                className="absolute end-3 top-3 rounded-md p-1.5 text-muted-foreground hover:bg-white/5"
                aria-label={t.common.close}
              >
                <X className="h-4 w-4" />
              </button>
              {sidebar}
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>

      {/* main */}
      <div className="relative z-10 flex min-w-0 flex-1 flex-col">
        {/* top brand bar — always shows KIAN AI in English */}
        <header className="relative z-20 flex items-center gap-2 border-b border-border/60 bg-sidebar/60 px-3 py-2 backdrop-blur-xl lg:px-5">
          <div className="kian-header-beam" aria-hidden="true" />
          <button
            onClick={() => setDrawerOpen(true)}
            className="rounded-lg p-2 transition-colors hover:bg-white/5 lg:hidden"
            aria-label={t.common.menu}
          >
            <Menu className="h-5 w-5" />
          </button>
          <Logo />
          <div className="ms-auto flex items-center gap-1.5 rounded-full border border-gold/25 bg-gold/5 px-3 py-1 text-[10px] font-extrabold tracking-[0.18em] text-gold">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-gold opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-gold" />
            </span>
            ONLINE
          </div>
        </header>

        <main className="min-h-0 flex-1">
          <AnimatePresence mode="wait">
            <motion.div
              key={view}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18 }}
              className="h-full"
            >
              {view === 'chat' && <ChatView />}
              {view === 'workspace' && (
                <WorkspaceView
                  autoOpenProjectId={autoOpenProjectId}
                  onAutoOpened={() => setAutoOpenProjectId(null)}
                />
              )}
              {view === 'agent' && <AgentView onOpenProject={openProjectFromAgent} />}
              {view === 'settings' && <SettingsView />}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  )
}

function SidebarContent({
  view,
  setView,
  navItems,
}: {
  view: View
  setView: (v: View) => void
  navItems: { key: View; label: string; icon: React.ReactNode }[]
}) {
  const { t, language, setLanguage, ownerName } = useKian()
  const { setTheme } = useTheme()

  return (
    <div className="flex h-full flex-col" dir={t.dir}>
      {/* logo */}
      <div className="flex items-center gap-3 px-4 pb-4 pt-5">
        <div className="relative">
          <span
            className="animate-spin-slow absolute -inset-[3px] rounded-2xl bg-[conic-gradient(from_0deg,var(--gold),var(--purple),transparent_55%,var(--gold))] opacity-75 blur-[2px]"
            aria-hidden="true"
          />
          <div className="kian-logo relative flex h-10 w-10 rotate-45 items-center justify-center rounded-xl shadow-lg">
            <span className="-rotate-45 text-lg font-extrabold text-black">K</span>
          </div>
        </div>
        <div>
          <h1 className="kian-gradient-text text-lg font-black leading-tight tracking-[0.1em]">KIAN AI</h1>
          <p className="text-[10px] text-muted-foreground">{t.tagline}</p>
        </div>
      </div>

      {/* nav */}
      <nav className="flex-1 space-y-1 px-3" aria-label="Main navigation">
        {navItems.map((item) => (
          <button
            key={item.key}
            onClick={() => setView(item.key)}
            className={`flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm transition-all ${
              view === item.key
                ? 'border border-gold/30 bg-gradient-to-l from-gold/15 to-purple/10 font-bold text-gold'
                : 'border border-transparent text-muted-foreground hover:bg-white/5 hover:text-foreground'
            }`}
            aria-current={view === item.key ? 'page' : undefined}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </nav>

      {/* footer controls */}
      <div className="space-y-2 border-t border-border/60 p-3">
        <div className="flex gap-2">
          <button
            onClick={() => setLanguage(language === 'fa' ? 'en' : 'fa')}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border px-2 py-2 text-xs text-muted-foreground transition-colors hover:border-gold/40 hover:text-gold"
            aria-label="Language"
          >
            <Languages className="h-3.5 w-3.5" />
            {language === 'fa' ? 'فارسی' : 'English'}
          </button>
          <button
            onClick={() => setTheme(document.documentElement.classList.contains('dark') ? 'light' : 'dark')}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border px-2 py-2 text-xs text-muted-foreground transition-colors hover:border-gold/40 hover:text-gold"
            aria-label="Theme"
          >
            <Sun className="hidden h-3.5 w-3.5 dark:inline" />
            <Moon className="inline h-3.5 w-3.5 dark:hidden" />
            <span className="hidden dark:inline">{t.settings.light}</span>
            <span className="inline dark:hidden">{t.settings.dark}</span>
          </button>
        </div>
        <div className="flex items-center gap-2.5 rounded-xl border border-gold/20 bg-gold/5 px-3 py-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-gold to-purple text-xs font-extrabold text-black">
            {(ownerName || 'K').slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="truncate text-xs font-bold">{ownerName || t.appName}</p>
            <p className="text-[10px] text-gold">{t.ownerBadge}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

function Logo() {
  const { t } = useKian()
  return (
    <div className="flex items-center gap-2.5">
      <div className="relative">
        <span
          className="animate-spin-slow absolute -inset-[3px] rounded-2xl bg-[conic-gradient(from_0deg,var(--gold),var(--purple),transparent_55%,var(--gold))] opacity-75 blur-[2px]"
          aria-hidden="true"
        />
        <div className="kian-logo animate-glow-pulse relative flex h-9 w-9 rotate-45 items-center justify-center rounded-xl shadow-lg">
          <span className="-rotate-45 text-sm font-extrabold text-black">K</span>
        </div>
      </div>
      <div className="leading-tight">
        <span className="kian-gradient-text kian-title-glow block text-base font-black tracking-[0.12em]">KIAN AI</span>
        <span className="block text-[10px] text-muted-foreground">{t.tagline}</span>
      </div>
    </div>
  )
}
