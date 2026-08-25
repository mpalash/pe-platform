/**
 * ⚠️  SPIKE CODE — throwaway. Phase 1 §1.5.
 *
 * Step 4: the link lands here. Validate, burn the token, set the session cookie.
 *
 * The cookie is the thing this spike most needs to prove. `Secure` cookies are
 * not set over plain HTTP, so localhost needs it false while a deployed
 * environment needs it true — a config split, verified now rather than at deploy.
 */
export default defineEventHandler(async (event) => {
  const rawToken = getQuery(event)['token']

  if (typeof rawToken !== 'string' || !rawToken) {
    throw createError({ statusCode: 400, statusMessage: 'Missing token.' })
  }

  const result = await consumeLoginToken(rawToken)

  if (!result.ok) {
    // One message for every failure — an attacker learns nothing from the reason.
    console.warn('[auth] link rejected', { reason: result.reason })
    return sendRedirect(event, '/spike?error=invalid-link', 302)
  }

  const config = useRuntimeConfig()
  const sessionId = await createSession(result.userId, result.email, Number(config.sessionTtlDays))

  setCookie(event, config.sessionCookieName, sessionId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: Boolean(config.sessionCookieSecure),
    path: '/',
    maxAge: Number(config.sessionTtlDays) * 24 * 60 * 60,
  })

  console.info('[auth] signed in', { email: result.email })

  return sendRedirect(event, '/spike', 302)
})
