import { NextRequest, NextResponse } from 'next/server'
import { AUTH_COOKIE, AUTH_COOKIE_MAX_AGE, accessPassword, authCookieValue } from '@/lib/auth'

/** POST /api/auth/unlock — body: { password } */
export async function POST(req: NextRequest) {
  let body: { password?: unknown }
  try {
    body = await req.json()
  } catch {
    return Response.json({ ok: false, message: 'invalid json' }, { status: 400 })
  }

  const password = accessPassword()
  if (!password) {
    // No lock configured — nothing to unlock.
    return Response.json({ ok: true, locked: false })
  }

  const attempt = (body.password ?? '').toString()
  if (!attempt || attempt !== password) {
    return Response.json({ ok: false, message: 'wrong password' }, { status: 401 })
  }

  const res = Response.json({ ok: true, locked: true })
  res.headers.append(
    'Set-Cookie',
    [
      `${AUTH_COOKIE}=${await authCookieValue(password)}`,
      'Path=/',
      'HttpOnly',
      'SameSite=Lax',
      `Max-Age=${AUTH_COOKIE_MAX_AGE}`,
    ].join('; ')
  )
  return res
}
