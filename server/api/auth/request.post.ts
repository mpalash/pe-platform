import { createUser, readUsers, updateUser } from '@directus/sdk'

/**
 * Request a sign-in link.
 *
 * This is the whole of "sign in" AND the whole of "register" — under magic-link
 * there is no difference between them. An address we know gets a link; an
 * address we do not know gets a user record and then a link. The UI presents
 * two doors because people expect two doors; behind them is one flow.
 *
 * ADR-002: no passwords anywhere, and no social identity provider. That is why
 * pe-vue's PocketBase email+password and Google/Facebook OAuth are not ported.
 */

/** Deliberately vague, and identical whatever happened. See below. */
const ACCEPTED = { sent: true } as const

const RATE_LIMIT = {
  perAddress: 3, // links per address per window
  perIp: 10, // links per IP per window — a shared office should still work
  windowMs: 15 * 60 * 1000,
}

async function underLimit(key: string, max: number): Promise<boolean> {
  const storage = useStorage('auth')
  const bucketKey = `ratelimit:${key}`

  const bucket = await storage.getItem<{ count: number, resetAt: number }>(bucketKey)
  const now = Date.now()

  if (!bucket || bucket.resetAt < now) {
    await storage.setItem(bucketKey, { count: 1, resetAt: now + RATE_LIMIT.windowMs })
    return true
  }

  if (bucket.count >= max) return false

  await storage.setItem(bucketKey, { count: bucket.count + 1, resetAt: bucket.resetAt })
  return true
}

export default defineEventHandler(async (event) => {
  const body = await readBody<{ email?: string, name?: string }>(event)
  const email = body?.email?.trim().toLowerCase()
  const name = body?.name?.trim()

  // Directus validates with Joi against the IANA TLD list, so a bare shape
  // check here keeps the error close to the user rather than 500ing later.
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    throw createError({ statusCode: 400, statusMessage: 'Enter a valid email address.' })
  }

  /*
   * Rate limiting, per address and per IP.
   *
   * Without it this endpoint is an open mail relay: anyone can make us send
   * unlimited mail to any address, which costs money and burns the sending
   * domain's reputation — and magic-link mail is the only way in, so a
   * blacklisted domain locks every user out at once (hard rule 9).
   */
  const ip = getRequestIP(event, { xForwardedFor: true }) ?? 'unknown'

  if (!(await underLimit(`email:${email}`, RATE_LIMIT.perAddress))
    || !(await underLimit(`ip:${ip}`, RATE_LIMIT.perIp))) {
    console.warn('[auth] rate limited', { email, ip })
    throw createError({
      statusCode: 429,
      statusMessage: 'Too many sign-in links requested. Try again in a few minutes.',
    })
  }

  const directus = useDirectus()
  const config = useRuntimeConfig()

  const existing = await directus.request(
    readUsers({ filter: { email: { _eq: email } }, limit: 1, fields: ['id', 'email', 'first_name'] }),
  ) as unknown as Array<{ id: string, email: string, first_name: string | null }>

  let user = existing[0]

  if (!user) {
    /*
     * New users get no role, deliberately.
     *
     * Phase 5 §0 finding 2 flagged this as a decision to make rather than
     * inherit: a role-less user cannot sign into the Directus admin, which is
     * exactly right for a site visitor. Authorization for them lives in Nitro
     * (ADR-002), so there is nothing for a Directus role to grant.
     */
    user = await directus.request(
      createUser({ email, status: 'active', ...(name ? { first_name: name } : {}) }),
    ) as unknown as { id: string, email: string, first_name: string | null }

    console.info('[auth] created user', { email })
  }
  else if (name && !user.first_name) {
    // Someone who "registered" with a name we already knew as an address.
    await directus.request(updateUser(user.id, { first_name: name }))
  }

  const rawToken = await issueLoginToken(user.id, email)
  const link = `${config.public.siteUrl}/api/auth/verify?token=${encodeURIComponent(rawToken)}`

  await sendMagicLink(email, link)

  /*
   * Always the same answer.
   *
   * Reporting "no such account" would turn this endpoint into a way to test
   * whether an address has an account here — which, for an archive about
   * violence, is a disclosure that could matter to someone.
   */
  return ACCEPTED
})
