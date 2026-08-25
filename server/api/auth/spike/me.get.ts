/**
 * ⚠️  SPIKE CODE — throwaway. Phase 1 §1.5.
 *
 * Step 5: identity read server-side, from the session cookie, never from the
 * request body. That is hard rule 6, and it starts here.
 */
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const sessionId = getCookie(event, config.sessionCookieName)

  if (!sessionId) return { signedIn: false as const }

  const session = await readSession(sessionId)

  if (!session) return { signedIn: false as const }

  return { signedIn: true as const, email: session.email, userId: session.userId }
})
