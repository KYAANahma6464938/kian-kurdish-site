// KIAN AI — lightweight access lock for public deployment.
// If KIAN_ACCESS_PASSWORD is set (server env), the whole app is gated behind
// an /unlock page. If it is not set (e.g. in this private sandbox), the lock
// is disabled entirely.
//
// This is a simple personal-use gate, not enterprise security: always deploy
// behind HTTPS and keep the password strong.

export const AUTH_COOKIE = 'kian_auth'
const SALT = 'kian-auth-v1'

export function accessPassword(): string | null {
  const p = process.env.KIAN_ACCESS_PASSWORD?.trim()
  return p ? p : null
}

/** sha256("<password>:<salt>") as hex — computable in edge & node runtimes. */
export async function authCookieValue(password: string): Promise<string> {
  const data = new TextEncoder().encode(`${password}:${SALT}`)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export async function isValidAuthCookie(value: string | undefined): Promise<boolean> {
  const password = accessPassword()
  if (!password) return true // lock not configured → open
  if (!value) return false
  const expected = await authCookieValue(password)
  return value === expected
}

export const AUTH_COOKIE_MAX_AGE = 60 * 60 * 24 * 30 // 30 days
