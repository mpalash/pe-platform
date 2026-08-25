/**
 * ⚠️  SPIKE CODE — throwaway. Phase 1 §1.5. Expect to delete this.
 *
 * Storage for the magic-link spike. Deliberately the crudest thing that works:
 * Nitro's built-in unstorage with a filesystem driver under `.data/` (gitignored).
 *
 * Why not a Directus collection: the spike must not add throwaway collections to
 * a committed schema snapshot. Phase 5 makes the real decision about where login
 * tokens and sessions live — see 05-phase-5-auth-magic-link.md §0.
 */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

interface LoginToken {
  userId: string
  email: string
  expiresAt: number
  usedAt: number | null
}

interface SpikeSession {
  userId: string
  email: string
  expiresAt: number
}

const LOGIN_TOKEN_TTL_MS = 15 * 60 * 1000 // 15 minutes

function storage() {
  return useStorage('spike')
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

export async function createSession(userId: string, email: string, ttlDays: number): Promise<string> {
  const sessionId = randomBytes(32).toString('base64url')

  await storage().setItem<SpikeSession>(`session:${hashToken(sessionId)}`, {
    userId,
    email,
    expiresAt: Date.now() + ttlDays * 24 * 60 * 60 * 1000,
  })

  return sessionId
}

export async function readSession(sessionId: string): Promise<SpikeSession | null> {
  const key = `session:${hashToken(sessionId)}`
  const session = await storage().getItem<SpikeSession>(key)

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
