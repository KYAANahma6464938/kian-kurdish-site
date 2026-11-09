import { NextRequest } from 'next/server'
import { AUTH_COOKIE, accessPassword, isValidAuthCookie } from '@/lib/auth'

/** GET /api/auth/status — { locked, authenticated, provider } */
export async function GET(req: NextRequest) {
  const locked = !!accessPassword()
  const authenticated = locked ? await isValidAuthCookie(req.cookies.get(AUTH_COOKIE)?.value) : true
  return Response.json({ locked, authenticated })
}
