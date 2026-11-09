import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

/** Tiny in-preview error reporter so broken code is visible honestly. */
const ERROR_REPORTER = `<script>
(function(){
  function show(msg){
    var b=document.createElement('div');
    b.style.cssText='position:fixed;bottom:0;left:0;right:0;z-index:99999;background:#7f1d1d;color:#fecaca;font:12px/1.5 monospace;padding:8px 12px;white-space:pre-wrap;max-height:40%;overflow:auto';
    b.textContent='JS ERROR: '+msg;
    document.body.appendChild(b);
  }
  window.addEventListener('error',function(e){show(e.message+' @ '+(e.filename||'')+(e.lineno?':'+e.lineno:''))});
  window.addEventListener('unhandledrejection',function(e){show('Unhandled promise rejection: '+(e.reason&&e.reason.message||e.reason))});
})();
</script>`

function normalizePath(p: string): string {
  const parts: string[] = []
  for (const seg of p.replace(/\\/g, '/').split('/')) {
    if (!seg || seg === '.') continue
    if (seg === '..') parts.pop()
    else parts.push(seg)
  }
  return parts.join('/')
}

function resolveRef(htmlDir: string, ref: string): string {
  const clean = ref.split('?')[0].split('#')[0]
  if (clean.startsWith('/')) return normalizePath(clean)
  return normalizePath(htmlDir ? htmlDir + '/' + clean : clean)
}

function inlineAssets(html: string, files: Map<string, string>): string {
  // CSS <link> → <style>
  html = html.replace(/<link\b[^>]*>/gi, (tag) => {
    const href = tag.match(/href\s*=\s*["']([^"']+)["']/i)?.[1]
    if (!href || !/\.css(\?|#|$)/i.test(href) || /^https?:\/\//i.test(href)) return tag
    const content = files.get(resolveRef('', href))
    return content != null ? `<style>\n${content}\n</style>` : tag
  })
  // JS <script src> → inline <script>
  html = html.replace(/<script\b[^>]*>\s*<\/script>/gi, (tag) => {
    const src = tag.match(/src\s*=\s*["']([^"']+)["']/i)?.[1]
    if (!src || /^https?:\/\//i.test(src)) return tag
    const content = files.get(resolveRef('', src))
    if (content == null) return tag
    const isModule = /type\s*=\s*["']module["']/i.test(tag)
    return `<script${isModule ? ' type="module"' : ''}>\n${content}\n</script>`
  })
  return html
}

function wrapReact(appJsx: string, styles: string[]): string {
  const shim = `
const { useState, useEffect, useRef, useMemo, useCallback, useReducer, createContext, useContext, Fragment } = React;
`
  const code =
    appJsx
      // strip ESM imports the UMD globals already provide
      .replace(/^\s*import\s+.*from\s+['"]react['"]\s*;?\s*$/gim, '')
      .replace(/^\s*import\s+.*from\s+['"]react-dom[^'"]*['"]\s*;?\s*$/gim, '')
      .replace(/^\s*import\s+['"][^'"]*\.(css|svg|png|jpg)['"]\s*;?\s*$/gim, '')
      // export default → assign to a known global
      .replace(/export\s+default\s+/g, 'window.__KIAN_APP__ = ')
      .replace(/export\s*\{[^}]*as\s+default\s*\}\s*;?/g, '') +
    `\nif (!window.__KIAN_APP__) { window.__KIAN_APP__ = (typeof App !== 'undefined' ? App : null); }`

  return `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>KIAN React Preview</title>
${styles.map((s) => `<style>\n${s}\n</style>`).join('\n')}
<script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
<script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
<script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
</head>
<body>
<div id="root"></div>
${ERROR_REPORTER}
<script type="text/babel" data-presets="react">
${shim}
${code}
const RootComponent = window.__KIAN_APP__;
if (!RootComponent) {
  document.getElementById('root').innerHTML = '<div style="padding:2rem;font-family:sans-serif">src/App.jsx must default-export a component (e.g. <code>export default function App() {...}</code>).</div>';
} else {
  ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(RootComponent));
}
</script>
</body>
</html>`
}

/**
 * GET /api/projects/[id]/preview          → live HTML preview (assets inlined)
 * GET /api/projects/[id]/preview?download=1 → same bundle as a file download
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const project = await db.project.findUnique({ where: { id }, include: { files: true } })
  if (!project) return NextResponse.json({ error: 'project not found' }, { status: 404 })

  const fileMap = new Map(project.files.map((f) => [normalizePath(f.path), f.content]))
  const reactEntry = fileMap.get('src/App.jsx') ?? fileMap.get('src/app.jsx')
  const htmlEntry =
    fileMap.get('index.html') ??
    [...fileMap.entries()].find(([p]) => p.endsWith('.html'))?.[1]

  let html: string
  if (htmlEntry != null) {
    html = inlineAssets(htmlEntry, fileMap)
    html = html.includes('</body>')
      ? html.replace('</body>', `${ERROR_REPORTER}\n</body>`)
      : html + ERROR_REPORTER
  } else if (reactEntry != null) {
    const styles = [...fileMap.entries()]
      .filter(([p]) => p.endsWith('.css'))
      .map(([, c]) => c)
    html = wrapReact(reactEntry, styles)
  } else {
    html = `<!DOCTYPE html><html><body style="font-family:sans-serif;padding:2rem">
<h2>No preview entry point</h2><p>This project has no <code>index.html</code> and no <code>src/App.jsx</code>.</p>
</body></html>`
  }

  const headers: Record<string, string> = { 'Content-Type': 'text/html; charset=utf-8' }
  if (req.nextUrl.searchParams.get('download')) {
    const safe = project.name.replace(/[^\p{L}\p{N}\-_ ]/gu, '').trim() || 'kian-project'
    headers['Content-Disposition'] = `attachment; filename="${encodeURIComponent(safe)}.html"`
  }
  return new NextResponse(html, { headers })
}
