export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const sessionId = getCookie(event, config.sessionCookieName)

  if (sessionId) await destroySession(sessionId)

  deleteCookie(event, config.sessionCookieName, { path: '/' })

  return { signedOut: true }
})
