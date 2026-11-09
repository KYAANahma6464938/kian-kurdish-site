import ZAI from 'z-ai-web-dev-sdk'

/**
 * KIAN AI — server-side AI layer.
 * IMPORTANT: z-ai-web-dev-sdk runs on the SERVER only.
 * Credentials are injected by the runtime environment; no API key ever
 * reaches the frontend bundle.
 *
 * Generation strategy (reliability-first):
 *   1. A small PLANNING call lists the files to write (tiny JSON, never truncated).
 *   2. One WRITE call per file outputs RAW code (no JSON escaping possible).
 * This avoids the classic failure of one giant JSON blob hitting the
 * output-token limit and breaking mid-string.
 */

export type ChatMessage = {
  role: 'user' | 'assistant' | 'system'
  content: string
}

let cachedZAI: Awaited<ReturnType<typeof ZAI.create>> | null = null

export async function getZAI() {
  if (!cachedZAI) {
    cachedZAI = await ZAI.create()
  }
  return cachedZAI
}

// ─── Portable provider layer ─────────────────────────────────────
// Two modes:
//   1. BUILT-IN (default in this environment): z-ai-web-dev-sdk, credentials
//      injected by the runtime — no configuration, key never leaves the server.
//   2. SELF-HOSTED (public deployment): set AI_BASE_URL + AI_API_KEY (+ optional
//      AI_MODEL) to any OpenAI-compatible endpoint (OpenAI, OpenRouter, Groq,
//      Together, local Ollama…). Keys live only in server env vars.

export type ProviderConfig = { baseUrl: string; apiKey: string; model: string }

export function getCustomProvider(): ProviderConfig | null {
  const baseUrl = process.env.AI_BASE_URL?.trim().replace(/\/+$/, '')
  const apiKey = process.env.AI_API_KEY?.trim()
  if (!baseUrl || !apiKey) return null
  return { baseUrl, apiKey, model: process.env.AI_MODEL?.trim() || 'gpt-4o-mini' }
}

export function providerMode(): 'built-in' | 'custom' {
  return getCustomProvider() ? 'custom' : 'built-in'
}

function toOpenAiBody(messages: ChatMessage[], stream: boolean) {
  return {
    model: getCustomProvider()!.model,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
    stream,
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Run a chat completion with retry + exponential backoff. Throws on final failure. */
export async function chatComplete(
  messages: ChatMessage[],
  opts: { thinking?: boolean; retries?: number } = {}
): Promise<string> {
  const retries = opts.retries ?? 2
  let lastError: unknown

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      if (getCustomProvider()) {
        const res = await fetch(`${getCustomProvider()!.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${getCustomProvider()!.apiKey}`,
          },
          body: JSON.stringify(toOpenAiBody(messages, false)),
        })
        if (!res.ok) throw new Error(`Provider ${res.status}: ${(await res.text()).slice(0, 200)}`)
        const json = (await res.json()) as { choices?: { message?: { content?: string } }[] }
        const content = json.choices?.[0]?.message?.content ?? ''
        if (!content.trim()) throw new Error('Empty response from AI model')
        return content
      }

      const zai = await getZAI()
      const completion = await zai.chat.completions.create({
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        thinking: { type: opts.thinking ? 'enabled' : 'disabled' },
      })
      const content = completion.choices[0]?.message?.content ?? ''
      if (!content.trim()) throw new Error('Empty response from AI model')
      return content
    } catch (error) {
      lastError = error
      if (attempt < retries) {
        await sleep(800 * attempt)
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

/**
 * Start a streaming chat completion.
 * Returns a web ReadableStream of SSE bytes ("data: {...}" lines + "data: [DONE]"),
 * identical in shape for both the built-in SDK and OpenAI-compatible providers —
 * so the /api/chat/stream route can parse either one the same way.
 */
export async function chatStream(messages: ChatMessage[]): Promise<ReadableStream<Uint8Array>> {
  if (getCustomProvider()) {
    const cfg = getCustomProvider()!
    const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify(toOpenAiBody(messages, true)),
    })
    if (!res.ok || !res.body) {
      throw new Error(`Provider ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`)
    }
    return res.body
  }

  const zai = await getZAI()
  const upstream = await zai.chat.completions.create({
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
    stream: true,
    thinking: { type: 'disabled' },
  })
  // The SDK returns a web ReadableStream of SSE bytes (verified).
  return upstream as ReadableStream<Uint8Array>
}

/**
 * Cheap real check used by /api/health: for a custom provider, send a tiny
 * completion (a few tokens); for the built-in SDK, just initialize it.
 */
export async function pingAI(): Promise<void> {
  if (getCustomProvider()) {
    const cfg = getCustomProvider()!
    const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({
        model: cfg.model,
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 4,
        stream: false,
      }),
    })
    if (!res.ok) throw new Error(`Provider ${res.status}`)
    return
  }
  await getZAI()
}

// ─── JSON helpers (for the small planning calls) ────────────────

function escapeRawControlChars(s: string): string {
  let out = ''
  let inStr = false
  let esc = false
  for (const ch of s) {
    if (inStr) {
      if (esc) {
        out += ch
        esc = false
        continue
      }
      if (ch === '\\') {
        out += ch
        esc = true
        continue
      }
      if (ch === '"') {
        inStr = false
        out += ch
        continue
      }
      if (ch === '\n') {
        out += '\\n'
        continue
      }
      if (ch === '\r') {
        out += '\\r'
        continue
      }
      if (ch === '\t') {
        out += '\\t'
        continue
      }
      out += ch
      continue
    }
    if (ch === '"') inStr = true
    out += ch
  }
  return out
}

function closeOpenStructures(s: string): string {
  const stack: string[] = []
  let inStr = false
  let esc = false
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (inStr) {
      if (esc) {
        esc = false
        continue
      }
      if (ch === '\\') esc = true
      else if (ch === '"') inStr = false
      continue
    }
    if (ch === '"') inStr = true
    else if (ch === '{') stack.push('}')
    else if (ch === '[') stack.push(']')
    else if (ch === '}' || ch === ']') stack.pop()
  }
  let out = s
  if (inStr) out += '"'
  out = out.replace(/,\s*$/, '')
  while (stack.length) out += stack.pop()
  return out
}

/** Extract the first JSON object/array from an LLM response, with repair fallbacks. */
export function extractJson<T = unknown>(raw: string): T {
  const attempts: string[] = [raw]
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) attempts.push(fence[1].trim())

  // balanced scan candidates
  for (const [open, close] of [
    ['{', '}'],
    ['[', ']'],
  ] as const) {
    const start = raw.indexOf(open)
    if (start === -1) continue
    let depth = 0
    let inStr = false
    let esc = false
    for (let i = start; i < raw.length; i++) {
      const ch = raw[i]
      if (inStr) {
        if (esc) esc = false
        else if (ch === '\\') esc = true
        else if (ch === '"') inStr = false
        continue
      }
      if (ch === '"') inStr = true
      else if (ch === open) depth++
      else if (ch === close) {
        depth--
        if (depth === 0) {
          attempts.push(raw.slice(start, i + 1))
          break
        }
      }
    }
    if (depth > 0) attempts.push(closeOpenStructures(escapeRawControlChars(raw.slice(start))))
  }

  attempts.push(closeOpenStructures(escapeRawControlChars(raw)))

  for (const a of attempts) {
    try {
      return JSON.parse(a) as T
    } catch {
      /* next attempt */
    }
  }
  throw new Error('AI response did not contain valid JSON')
}

// ─── System prompts ─────────────────────────────────────────────

export const KIAN_IDENTITY_FA = `تو «کیان» هستی؛ دستیار هوشمند شخصیِ مالکِ این سیستم. تو فقط برای یک نفر کار می‌کنی و او «مالک» توست.
شخصیت تو: حرفه‌ای، دقیق، گرم و بدون اغراق. هرگز ادعا نمی‌کنی کاری انجام شده که واقعا انجام نشده.
تخصص تو: توسعه وب (HTML، CSS، JavaScript، React، Next.js)، طراحی رابط کاربری مدرن، دیباگ کردن و اتوماسیون.
قواعد پاسخ:
- به همان زبانی جواب بده که مالک با تو حرف می‌زند؛ اگر فارسی نوشت، فارسی روان و طبیعی جواب بده.
- اگر درخواست مربوط به ساخت یا اصلاح کد است، کد کامل و آماده اجرا بده و در بلوک کد با زبان مشخص شده قرار بده.
- اگر چیزی واقعا ممکن نیست یا به کلید API نیاز دارد، صادقانه بگو و راه جایگزین پیشنهاد بده.
- پاسخ‌ها را کوتاه و کاربردی نگه دار، مگر اینکه مالک توضیح مفصل بخواهد.`

export const KIAN_IDENTITY_EN = `You are "KIAN", the personal AI assistant of this system's single owner. You work for one person only — the "Owner".
Personality: professional, precise, warm, never exaggerated. Never claim a task is done when it is not.
Expertise: web development (HTML, CSS, JavaScript, React, Next.js), modern UI design, debugging, and automation.
Reply rules:
- Always answer in the same language the Owner writes in; if they write Persian, reply in fluent natural Persian.
- For code requests, give complete runnable code inside fenced code blocks with the language tag.
- If something is genuinely not possible or requires an API key, say so honestly and offer an alternative.
- Keep answers concise and practical unless the Owner asks for detail.`

export function buildSystemPrompt(language: 'fa' | 'en', ownerName?: string) {
  const base = language === 'fa' ? KIAN_IDENTITY_FA : KIAN_IDENTITY_EN
  const owner = ownerName?.trim()
    ? language === 'fa'
      ? `نام مالک: ${ownerName.trim()}.`
      : `Owner's name: ${ownerName.trim()}.`
    : ''
  return `${base}\n${owner}`.trim()
}

// ─── File generation engine ─────────────────────────────────────

export type GeneratedFile = { path: string; content: string }
export type GenerationResult = { summary: string; files: GeneratedFile[] }

const MAX_FILES = 6
const CONTEXT_CAP = 14000

function langNote(language: 'fa' | 'en'): string {
  return language === 'fa'
    ? 'The owner writes in Persian: all human-readable text inside the generated website/UI must be in Persian with dir="rtl" and lang="fa", unless the instruction says otherwise. File paths and code stay in English.'
    : 'Human-readable text inside the generated website/UI must match the language of the instruction (English unless stated otherwise).'
}

function typeNote(projectType?: string): string {
  if (!projectType) return ''
  return `Project type: ${projectType}. landing = marketing/landing page; dashboard = analytics/admin dashboard UI; webapp = interactive single-page app; react = React project (src/App.jsx default-exported component, React UMD globals only — no npm imports; optional src/styles.css); custom = follow the instruction.`
}

function filesContext(existing?: GeneratedFile[]): string {
  if (!existing?.length) return 'This is a NEW project: no existing files.'
  return `EXISTING PROJECT FILES:\n${existing
    .map((f) => `--- ${f.path} ---\n${f.content.slice(0, CONTEXT_CAP)}`)
    .join('\n\n')}`
}

/** Small, safe planning call: which files to write. */
async function planFiles(args: {
  taskDescription: string
  language: 'fa' | 'en'
  projectType?: string
}): Promise<{ summary: string; files: { path: string; purpose: string }[] }> {
  const prompt = [
    `You are KIAN, an elite web engineer working for the system owner.`,
    `TASK: ${args.taskDescription}`,
    typeNote(args.projectType),
    langNote(args.language),
    `Plan the files needed for this task (max ${MAX_FILES} files). Prefer the classic static layout: index.html, css/styles.css, js/app.js — or src/App.jsx + src/styles.css for react projects.`,
    `STRICT OUTPUT — one JSON object only, no fences:
{"summary": "<one short sentence (in ${args.language === 'fa' ? 'Persian' : 'English'}) describing what this task builds>", "files": [{"path": "<relative/path>", "purpose": "<what this file contains>"}]}`,
  ]
    .filter(Boolean)
    .join('\n\n')

  const raw = await chatComplete([
    { role: 'assistant', content: 'You output exactly one valid JSON object, nothing else.' },
    { role: 'user', content: prompt },
  ])
  const parsed = extractJson<{ summary?: string; files?: { path?: string; purpose?: string }[] }>(raw)
  const files = (parsed.files ?? [])
    .filter((f) => f && typeof f.path === 'string' && f.path.trim())
    .slice(0, MAX_FILES)
    .map((f) => ({
      path: f.path!.replace(/^[./\\]+/, '').trim(),
      purpose: typeof f.purpose === 'string' ? f.purpose : '',
    }))
  if (!files.length) throw new Error('AI file plan was empty')
  return { summary: parsed.summary ?? '', files }
}

/** One WRITE call per file: raw code output, no JSON escaping involved. */
async function writeFile(args: {
  path: string
  purpose: string
  taskDescription: string
  language: 'fa' | 'en'
  projectType?: string
  generated: GeneratedFile[]
  existing?: GeneratedFile[]
  improveExisting?: boolean
}): Promise<string> {
  const { path, purpose, taskDescription, language, projectType, generated, existing, improveExisting } = args

  const contextBlocks: string[] = []
  for (const f of generated) {
    if (f.path === path) continue
    contextBlocks.push(`--- ALREADY WRITTEN: ${f.path} ---\n${f.content.slice(0, CONTEXT_CAP)}`)
  }
  const existingSelf = existing?.find((f) => f.path === path)
  const existingOthers = existing?.filter((f) => f.path !== path).slice(0, 3)
  for (const f of existingOthers ?? []) {
    contextBlocks.push(`--- OTHER EXISTING FILE: ${f.path} ---\n${f.content.slice(0, CONTEXT_CAP)}`)
  }

  const selfBlock =
    existingSelf && (improveExisting || taskDescription.toLowerCase().includes('fix'))
      ? `--- CURRENT CONTENT OF ${path} (improve/fix it, return the FULL updated version) ---\n${existingSelf.content.slice(0, CONTEXT_CAP)}`
      : existingSelf
        ? `--- CURRENT CONTENT OF ${path} (for reference) ---\n${existingSelf.content.slice(0, CONTEXT_CAP)}`
        : ''

  const prompt = [
    `You are KIAN, an elite web engineer working for the system owner.`,
    `TASK: ${taskDescription}`,
    typeNote(projectType),
    langNote(language),
    contextBlocks.length ? contextBlocks.join('\n\n') : '',
    selfBlock,
    `NOW WRITE THE COMPLETE FILE: "${path}"${purpose ? ` — ${purpose}` : ''}`,
    `Rules:
- Output the COMPLETE final content of this single file. It must work when saved as-is.
- Keep it compact but production-quality: modern responsive design, clean typography, smooth micro-animations.
- Match ids/classes/names used in the other files shown above (they are already written).
- No placeholders, no TODOs, no truncation. If the file is code, keep it under ~250 lines.`,
    `OUTPUT FORMAT: the raw file content ONLY. No markdown fences, no commentary, no explanation — start directly with the file content.`,
  ]
    .filter(Boolean)
    .join('\n\n')

  const raw = await chatComplete([
    {
      role: 'assistant',
      content:
        'You are KIAN, an elite web engineer. You output raw file content only — never wrap output in markdown fences or explanations.',
    },
    { role: 'user', content: prompt },
  ])

  // strip accidental fences / leading label lines
  let content = raw.trim()
  const fenceMatch = content.match(/^```[\w-]*\s*\n([\s\S]*?)\n?```$/)
  if (fenceMatch) content = fenceMatch[1]
  content = content.replace(/^```[\w-]*\s*\n/, '').replace(/\n```\s*$/, '')
  return content
}

/** Full generation engine: plan → write each file. */
export async function aiWriteFiles(args: {
  taskDescription: string
  language: 'fa' | 'en'
  projectType?: string
  existingFiles?: GeneratedFile[]
  improveExisting?: boolean
}): Promise<GenerationResult> {
  const { taskDescription, language, projectType, existingFiles, improveExisting } = args

  const plan = await planFiles({ taskDescription, language, projectType })

  const files: GeneratedFile[] = []
  for (const f of plan.files) {
    const content = await writeFile({
      path: f.path,
      purpose: f.purpose,
      taskDescription,
      language,
      projectType,
      generated: files,
      existing: existingFiles,
      improveExisting,
    })
    if (content.trim()) files.push({ path: f.path, content })
  }

  if (!files.length) throw new Error('AI produced no usable files')
  return { summary: plan.summary, files }
}

/** High-level modes used by the projects API. */
export async function generateProjectFiles(args: {
  mode: 'create' | 'improve' | 'fix' | 'add'
  instruction: string
  language: 'fa' | 'en'
  projectType?: string
  existingFiles?: GeneratedFile[]
}): Promise<GenerationResult> {
  const { mode, instruction, language, projectType, existingFiles } = args
  const taskByMode: Record<typeof mode, string> = {
    create: `Create a complete, production-quality project from this instruction: """${instruction}"""`,
    improve: `Improve this existing project (better design, polish, responsiveness, accessibility). Owner note: """${instruction}"""`,
    fix: `Find and FIX real bugs in this project, then return corrected files. Owner note: """${instruction}"""`,
    add: `Extend this existing project with a new feature. Owner note: """${instruction}"""`,
  }
  return aiWriteFiles({
    taskDescription: taskByMode[mode],
    language,
    projectType,
    existingFiles,
    improveExisting: mode === 'improve' || mode === 'fix' || mode === 'add',
  })
}

// ─── Agent planning & execution ─────────────────────────────────

export type PlanStep = {
  id: string
  title: string
  description: string
  type: 'analyze' | 'create' | 'edit' | 'organize' | 'review'
}

export async function planTask(args: {
  instruction: string
  language: 'fa' | 'en'
  projectContext?: string
}): Promise<{ title: string; steps: PlanStep[] }> {
  const { instruction, language, projectContext } = args
  const prompt = `You are KIAN, a senior software planning agent. Break the owner's instruction into 2–5 concrete, executable steps for building/maintaining a static web project (HTML/CSS/JS or React files).

${projectContext ? `Target project already has these files: ${projectContext}` : 'No project exists yet — the first step should create the project files.'}

Owner instruction: """${instruction}"""

STRICT OUTPUT — one JSON object only:
{"title": "<short task title>", "steps": [{"id": "step-1", "title": "<short step title>", "description": "<what exactly to produce in this step>", "type": "analyze|create|edit|organize|review"}]}
- Steps must be ordered and independently verifiable.
- Each "create"/"edit" step must name the files it will produce or change.
- Respond in ${language === 'fa' ? 'Persian (Farsi)' : 'English'} for title/description text.
- Never wrap JSON in fences.`

  const raw = await chatComplete([
    { role: 'assistant', content: 'You output exactly one valid JSON object, nothing else.' },
    { role: 'user', content: prompt },
  ])
  const parsed = extractJson<{ title?: string; steps?: PlanStep[] }>(raw)
  const steps = (parsed.steps ?? [])
    .filter((s) => s && typeof s.title === 'string' && typeof s.description === 'string')
    .map((s, i) => ({
      id: s.id || `step-${i + 1}`,
      title: s.title,
      description: s.description,
      type: (['analyze', 'create', 'edit', 'organize', 'review'].includes(s.type) ? s.type : 'edit') as PlanStep['type'],
    }))
  if (!steps.length) throw new Error('AI returned an empty plan')
  return { title: parsed.title ?? instruction.slice(0, 60), steps }
}

/** Execute one agent step for real. Analysis steps produce a report; others write files. */
export async function executePlanStep(args: {
  instruction: string
  step: PlanStep
  language: 'fa' | 'en'
  projectType?: string
  existingFiles?: GeneratedFile[]
}): Promise<GenerationResult> {
  const { instruction, step, language, projectType, existingFiles } = args
  const isAnalysis = step.type === 'analyze' || step.type === 'review'

  if (isAnalysis) {
    const report = await chatComplete([
      {
        role: 'assistant',
        content:
          language === 'fa'
            ? 'تو کیان هستی، مهندس نرم‌افزار. گزارش کوتاه، دقیق و کاربردی می‌دهی.'
            : 'You are KIAN, a software engineer. You give short, precise, actionable reports.',
      },
      {
        role: 'user',
        content: [
          `Overall task: """${instruction}"""`,
          `Step to perform now (analysis/review): ${step.title} — ${step.description}`,
          existingFiles?.length
            ? `PROJECT FILES:\n${existingFiles.map((f) => `--- ${f.path} ---\n${f.content.slice(0, CONTEXT_CAP)}`).join('\n\n')}`
            : 'No files exist yet.',
          language === 'fa'
            ? 'یک گزارش ۳ تا ۶ جمله‌ای بده: وضعیت فعلی، نکات مهم، و اینکه مراحل بعدی دقیقاً چه باید بسازند.'
            : 'Give a 3–6 sentence report: current state, key findings, and what the next steps must build exactly.',
        ].join('\n\n'),
      },
    ])
    return { summary: report.trim().slice(0, 2000), files: [] }
  }

  const taskDescription = `One step of a larger approved plan. Overall task: """${instruction}""". This step: ${step.title} — ${step.description}. Write or update the files this step requires.`

  return aiWriteFiles({
    taskDescription,
    language,
    projectType,
    existingFiles,
    improveExisting: true,
  })
}
