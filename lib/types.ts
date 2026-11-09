// KIAN AI — shared client-side types (server-independent, safe for client bundle)

export type ChatMsg = {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  createdAt: string
  pending?: boolean
  streaming?: boolean
  error?: string
}

export type ConversationItem = {
  id: string
  title: string
  language: string
  createdAt: string
  updatedAt: string
  _count?: { messages: number }
}

export type ConversationDetail = ConversationItem & { messages: ChatMsg[] }

export type ProjectFile = {
  id: string
  path: string
  content: string
  updatedAt: string
}

export type Project = {
  id: string
  name: string
  description: string
  type: 'landing' | 'dashboard' | 'webapp' | 'react' | 'custom' | string
  createdAt: string
  updatedAt: string
  files?: ProjectFile[]
  _count?: { files: number; tasks: number }
}

export type AgentStep = {
  id: string
  title: string
  description: string
  type: 'analyze' | 'create' | 'edit' | 'organize' | 'review' | string
  status: 'pending' | 'running' | 'done' | 'failed'
  result?: string
  error?: string
}

export type AgentLog = {
  at: string
  level: 'info' | 'success' | 'error'
  message: string
}

export type AgentTask = {
  id: string
  title: string
  instruction: string
  status: 'planned' | 'running' | 'completed' | 'failed' | string
  plan: string // JSON: AgentStep[]
  logs: string // JSON: AgentLog[]
  projectId: string | null
  project?: { id: string; name: string } | null
  createdAt: string
  updatedAt: string
}

export function parseSteps(task: AgentTask): AgentStep[] {
  try {
    return JSON.parse(task.plan || '[]') as AgentStep[]
  } catch {
    return []
  }
}

export function parseLogs(task: AgentTask): AgentLog[] {
  try {
    return JSON.parse(task.logs || '[]') as AgentLog[]
  } catch {
    return []
  }
}

export type Health = {
  ok: boolean
  database: boolean
  ai: boolean
  provider?: 'built-in' | 'custom'
  dbError: string | null
  aiError: string | null
  time: string
}

export type AuthStatus = {
  locked: boolean
  authenticated: boolean
}
