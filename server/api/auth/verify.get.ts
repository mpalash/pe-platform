import { readUsers } from '@directus/sdk'

export default defineEventHandler(async (event) => {
  const rawToken = getQuery(event)['token']

  if (typeof rawToken !== 'string' || !rawToken) {
    throw createError({ statusCode: 400, statusMessage: 'Missing token.' })
  }

  const result = await consumeLoginToken(rawToken)

  if (!result.ok) {
    // One message for every failure — an attacker learns nothing from the reason.
    console.warn('[auth] link rejected', { reason: result.reason })
    return sendRedirect(event, '/?auth=invalid-link', 302)
  }

  const config = useRuntimeConfig()

  // Carry the display name onto the session so the header can greet someone by
  // name without a Directus round trip on every page.
  let displayName: string | null = null
  try {
    const [user] = await useDirectus().request(
      readUsers({ filter: { id: { _eq: result.userId } }, limit: 1, fields: ['first_name'] }),
    ) as unknown as Array<{ first_name: string | null }>
    displayName = user?.first_name ?? null
  }
  catch {
    // A missing name is cosmetic; it must never block a sign-in.
  }

  const sessionId = await createSession(
    result.userId,
    result.email,
    Number(config.sessionTtlDays),
    displayName,
  )

  setCookie(event, config.sessionCookieName, sessionId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: Boolean(config.sessionCookieSecure),
    path: '/',
    maxAge: Number(config.sessionTtlDays) * 24 * 60 * 60,
  })

  console.info('[auth] signed in', { email: result.email })

  return sendRedirect(event, '/?auth=signed-in', 302)
})
