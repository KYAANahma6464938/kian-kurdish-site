import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { pingAI, providerMode } from '@/lib/ai'

export const dynamic = 'force-dynamic'

/** Real system health — used by the Settings "System status" panel. */
export async function GET() {
  let database = false
  let ai = false
  let dbError: string | null = null
  let aiError: string | null = null

  try {
    await db.$queryRaw`SELECT 1`
    database = true
  } catch (e) {
    dbError = e instanceof Error ? e.message : String(e)
  }

  try {
    await pingAI()
    ai = true
  } catch (e) {
    aiError = e instanceof Error ? e.message : String(e)
  }

  return NextResponse.json({
    ok: database && ai,
    database,
    ai,
    provider: providerMode(),
    dbError,
    aiError,
    time: new Date().toISOString(),
  })
}
