import { NextRequest, NextResponse } from 'next/server'
import { AUTH_COOKIE, accessPassword, isValidAuthCookie } from '@/lib/auth'

/**
 * KIAN access lock (active only when KIAN_ACCESS_PASSWORD is set).
 * Pages → redirect to /unlock · APIs → 401 JSON.
 */
export async function middleware(req: NextRequest) {
  if (!accessPassword()) return NextResponse.next()

  const url = req.nextUrl
  if (url.pathname.startsWith('/unlock') || url.pathname.startsWith('/api/auth')) {
    return NextResponse.next()
  }

  const ok = await isValidAuthCookie(req.cookies.get(AUTH_COOKIE)?.value)
  if (ok) return NextResponse.next()

  if (url.pathname.startsWith('/api/')) {
    return NextResponse.json(
      { error: 'UNAUTHORIZED', message: 'This KIAN instance is locked.' },
      { status: 401 }
    )
  }

  const redirect = url.clone()
  redirect.pathname = '/unlock'
  redirect.search = ''
  return NextResponse.redirect(redirect)
}

export const config = {
  matcher: ['/((?!_next|favicon.ico|robots.txt|kian-icon.svg|logo.svg).*)'],
}
