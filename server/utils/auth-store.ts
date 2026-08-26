/**
 * Login tokens and sessions.
 *
 * Tokens are stored as a SHA-256 hash with an expiry, never in the clear, and
 * are burned before a session is minted so a replayed link cannot mint a second
 * one. Sessions are opaque random ids; the cookie carries the id and nothing
 * else, so there is no client-side claim to forge (hard rule 6).
 *
 * ⚠️ STORAGE IS STILL THE SPIKE'S. Nitro's unstorage with a filesystem driver
 * under `.data/`. That is fine on one machine and wrong for anything deployed:
 * it does not survive a redeploy, and it does not work across instances.
 * Phase 5 §0 finding 3 calls for two Directus collections instead, which also
 * gives admins visibility. **That migration is outstanding.**
 */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

interface LoginToken {
  userId: string
  email: string
  expiresAt: number
  usedAt: number | null
}

interface StoredSession {
  userId: string
  email: string
  name?: string | null
  expiresAt: number
}

const LOGIN_TOKEN_TTL_MS = 15 * 60 * 1000 // 15 minutes

function storage() {
  return useStorage('auth')
}

/** Store the hash, hand back the raw token. The raw value is never persisted. */
export function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex')
}

export async function issueLoginToken(userId: string, email: string): Promise<string> {
  const rawToken = randomBytes(32).toString('base64url')

  await storage().setItem<LoginToken>(`login:${hashToken(rawToken)}`, {
    userId,
    email,
    expiresAt: Date.now() + LOGIN_TOKEN_TTL_MS,
    usedAt: null,
  })

  return rawToken
}

export type ConsumeResult
  = | { ok: true, userId: string, email: string }
    | { ok: false, reason: 'unknown' | 'expired' | 'already-used' }

/**
 * Single-use by construction: the token is marked used before a session exists,
 * so a replayed link cannot mint a second session.
 */
export async function consumeLoginToken(rawToken: string): Promise<ConsumeResult> {
  const key = `login:${hashToken(rawToken)}`
  const record = await storage().getItem<LoginToken>(key)

  if (!record) return { ok: false, reason: 'unknown' }
  if (record.usedAt !== null) return { ok: false, reason: 'already-used' }

  if (record.expiresAt < Date.now()) {
    await storage().removeItem(key)
    return { ok: false, reason: 'expired' }
  }

  await storage().setItem<LoginToken>(key, { ...record, usedAt: Date.now() })

  return { ok: true, userId: record.userId, email: record.email }
}

export async function createSession(
  userId: string,
  email: string,
  ttlDays: number,
  name?: string | null,
): Promise<string> {
  const sessionId = randomBytes(32).toString('base64url')

  await storage().setItem<StoredSession>(`session:${hashToken(sessionId)}`, {
    userId,
    email,
    name: name ?? null,
    expiresAt: Date.now() + ttlDays * 24 * 60 * 60 * 1000,
  })

  return sessionId
}

export async function readSession(sessionId: string): Promise<StoredSession | null> {
  const key = `session:${hashToken(sessionId)}`
  const session = await storage().getItem<StoredSession>(key)

  if (!session) return null

  if (session.expiresAt < Date.now()) {
    await storage().removeItem(key)
    return null
  }

  return session
}

export async function destroySession(sessionId: string): Promise<void> {
  await storage().removeItem(`session:${hashToken(sessionId)}`)
}

/** Constant-time compare, for anywhere a secret is checked against a candidate. */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}
