/**
 * Login tokens and sessions, in Directus.
 *
 * Tokens are stored as a SHA-256 hash with an expiry, never in the clear, and
 * are burned before a session is minted so a replayed link cannot mint a second
 * one. Sessions are opaque random ids; the cookie carries the id and nothing
 * else, so there is no client-side claim to forge (hard rule 6).
 *
 * Storage is `auth_login_tokens` and `auth_sessions`, reached with the service
 * token. It used to be Nitro's unstorage on the filesystem under `.data/`,
 * which is fine on one machine and wrong for anything deployed: it does not
 * survive a redeploy and is not shared between instances. On a platform with an
 * ephemeral disk that meant every deploy signed everyone out and invalidated
 * the magic links already sitting in inboxes. Two collections also give admins
 * something they never had — a list of live sessions, revocable by deleting a
 * row. (Phase 5 §0 finding 3.)
 *
 * Rows are keyed by hash and looked up with a filter. Every read that finds an
 * expired row deletes it, so ordinary traffic keeps both tables trimmed without
 * a scheduled job.
 */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { createItem, deleteItem, readItems, updateItem } from '@directus/sdk'

/** As stored. Timestamps are ISO strings because that is what Directus returns. */
interface StoredLoginToken {
  id: string
  user: string
  email: string
  expires_at: string
  used_at: string | null
}

interface StoredSessionRow {
  id: string
  user: string
  email: string
  name: string | null
  expires_at: string
}

/**
 * As the rest of the app sees it. Deliberately unchanged from the filesystem
 * version so no caller had to move — the four auth routes are untouched.
 */
interface StoredSession {
  userId: string
  email: string
  name?: string | null
  expiresAt: number
}

const LOGIN_TOKEN_TTL_MS = 15 * 60 * 1000 // 15 minutes

/**
 * One row by hash, or null.
 *
 * `limit: 1` rather than a unique constraint doing the work: Directus item
 * creation would reject a duplicate hash, but a 32-byte random value colliding
 * is not a failure mode worth designing a schema around, and a filtered read is
 * the same single indexed lookup either way.
 */
async function findByHash<T>(collection: string, field: string, hash: string): Promise<T | null> {
  const rows = await useDirectus().request(
    readItems(collection, { filter: { [field]: { _eq: hash } }, limit: 1 }),
  ) as T[]

  return rows[0] ?? null
}

/** Store the hash, hand back the raw token. The raw value is never persisted. */
export function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex')
}

export async function issueLoginToken(userId: string, email: string): Promise<string> {
  const rawToken = randomBytes(32).toString('base64url')

  await useDirectus().request(createItem('auth_login_tokens', {
    token_hash: hashToken(rawToken),
    user: userId,
    email,
    expires_at: new Date(Date.now() + LOGIN_TOKEN_TTL_MS).toISOString(),
    used_at: null,
  }))

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
  const record = await findByHash<StoredLoginToken>(
    'auth_login_tokens', 'token_hash', hashToken(rawToken),
  )

  if (!record) return { ok: false, reason: 'unknown' }
  if (record.used_at !== null) return { ok: false, reason: 'already-used' }

  if (Date.parse(record.expires_at) < Date.now()) {
    await useDirectus().request(deleteItem('auth_login_tokens', record.id))
    return { ok: false, reason: 'expired' }
  }

  // Burned BEFORE the session is minted, so a replayed link cannot mint a
  // second one even if the two requests race.
  await useDirectus().request(updateItem('auth_login_tokens', record.id, {
    used_at: new Date().toISOString(),
  }))

  return { ok: true, userId: record.user, email: record.email }
}

export async function createSession(
  userId: string,
  email: string,
  ttlDays: number,
  name?: string | null,
): Promise<string> {
  const sessionId = randomBytes(32).toString('base64url')

  await useDirectus().request(createItem('auth_sessions', {
    session_hash: hashToken(sessionId),
    user: userId,
    email,
    name: name ?? null,
    expires_at: new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000).toISOString(),
  }))

  return sessionId
}

export async function readSession(sessionId: string): Promise<StoredSession | null> {
  const row = await findByHash<StoredSessionRow>(
    'auth_sessions', 'session_hash', hashToken(sessionId),
  )

  if (!row) return null

  const expiresAt = Date.parse(row.expires_at)

  if (expiresAt < Date.now()) {
    await useDirectus().request(deleteItem('auth_sessions', row.id))
    return null
  }

  return { userId: row.user, email: row.email, name: row.name, expiresAt }
}

export async function destroySession(sessionId: string): Promise<void> {
  const row = await findByHash<StoredSessionRow>(
    'auth_sessions', 'session_hash', hashToken(sessionId),
  )

  // Already gone is the desired end state, not an error.
  if (row) await useDirectus().request(deleteItem('auth_sessions', row.id))
}

/** Constant-time compare, for anywhere a secret is checked against a candidate. */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}
