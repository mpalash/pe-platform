export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const sessionId = getCookie(event, config.sessionCookieName)

  if (!sessionId) return { signedIn: false as const }

  const session = await readSession(sessionId)

  if (!session) return { signedIn: false as const }

  return {
    signedIn: true as const,
    email: session.email,
    userId: session.userId,
    name: session.name ?? null,
  }
})
