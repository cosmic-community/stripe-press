import { cookies } from 'next/headers'
import { sign, verify } from '@/lib/crypto-tokens'

export const SESSION_COOKIE = 'sp_session'
const SESSION_TTL = 14 * 24 * 60 * 60

export async function currentCustomer(): Promise<string | null> {
  const jar = await cookies()
  const data = verify<{ typ?: string; sub?: string }>(jar.get(SESSION_COOKIE)?.value)
  return data && data.typ === 'session' && data.sub ? data.sub : null
}

// Only call from server actions or route handlers.
export async function startSession(username: string): Promise<void> {
  const jar = await cookies()
  jar.set(SESSION_COOKIE, sign({ typ: 'session', sub: username, exp: Math.floor(Date.now() / 1000) + SESSION_TTL }), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_TTL,
  })
}

export async function endSession(): Promise<void> {
  const jar = await cookies()
  jar.delete(SESSION_COOKIE)
}
