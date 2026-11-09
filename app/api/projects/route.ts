import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { generateProjectFiles } from '@/lib/ai'

export const dynamic = 'force-dynamic'
export const maxDuration = 600

/** GET /api/projects — list all projects. */
export async function GET() {
  const projects = await db.project.findMany({
    orderBy: { updatedAt: 'desc' },
    include: { _count: { select: { files: true, tasks: true } } },
  })
  return NextResponse.json({ projects })
}

const STARTER_HTML = `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>پروژه جدید</title>
<link rel="stylesheet" href="css/styles.css">
</head>
<body>
<main class="hero">
  <h1>پروژه جدید</h1>
  <p>این پروژه تازه ساخته شده است. کد را ویرایش کن و نتیجه را در پیش‌نمایش ببین.</p>
</main>
<script src="js/app.js"></script>
</body>
</html>`

const STARTER_CSS = `* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  font-family: Vazirmatn, Tahoma, sans-serif;
  min-height: 100vh;
  display: grid;
  place-items: center;
  background: linear-gradient(135deg, #0b0b12, #1a1030);
  color: #f5f0e6;
}
.hero { text-align: center; padding: 2rem; }
h1 {
  font-size: clamp(2rem, 6vw, 3.5rem);
  background: linear-gradient(90deg, #d4af37, #a78bfa);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  margin-bottom: 1rem;
}
p { opacity: 0.8; line-height: 1.8; }`

const STARTER_JS = `document.querySelector('h1')?.addEventListener('click', () => {
  console.log('KIAN — پروژه جدید آماده است!');
});`

/** DELETE /api/projects — wipe all projects (files cascade). */
export async function DELETE() {
  await db.projectFile.deleteMany({})
  await db.agentTask.updateMany({ data: { projectId: null } })
  await db.project.deleteMany({})
  return NextResponse.json({ ok: true })
}

/**
 * POST /api/projects
 * body: { mode: 'ai', instruction, type?, name?, language }
 *     | { mode: 'empty', name, type }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const mode = body.mode === 'ai' ? 'ai' : 'empty'
    const language: 'fa' | 'en' = body.language === 'en' ? 'en' : 'fa'

    if (mode === 'empty') {
      const name: string = (body.name ?? '').toString().trim() || 'Untitled project'
      const type: string = ['landing', 'dashboard', 'webapp', 'react', 'custom'].includes(body.type)
        ? body.type
        : 'custom'
      const project = await db.project.create({
        data: {
          name: name.slice(0, 80),
          type,
          description: '',
          files: {
            create: [
              { path: 'index.html', content: STARTER_HTML },
              { path: 'css/styles.css', content: STARTER_CSS },
              { path: 'js/app.js', content: STARTER_JS },
            ],
          },
        },
        include: { files: true },
      })
      return NextResponse.json({ project })
    }

    // AI mode — real generation via backend AI
    const instruction: string = (body.instruction ?? '').toString().trim()
    if (!instruction) {
      return NextResponse.json({ error: 'instruction is required' }, { status: 400 })
    }
    const type: string = ['landing', 'dashboard', 'webapp', 'react', 'custom'].includes(body.type)
      ? body.type
      : 'landing'

    const result = await generateProjectFiles({
      mode: 'create',
      instruction,
      language,
      projectType: type,
    })

    const name: string =
      (body.name ?? '').toString().trim() ||
      instruction.replace(/\s+/g, ' ').slice(0, 48) + (instruction.length > 48 ? '…' : '')

    const project = await db.project.create({
      data: {
        name: name.slice(0, 80),
        type,
        description: result.summary.slice(0, 500),
        files: { create: result.files },
      },
      include: { files: true },
    })

    return NextResponse.json({ project, summary: result.summary })
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: 'GENERATION_FAILED', detail }, { status: 502 })
  }
}
