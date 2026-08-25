import { createUser, readUsers } from '@directus/sdk'

/**
 * ⚠️  SPIKE CODE — throwaway. Phase 1 §1.5.
 *
 * Step 1–3 of the spike: take an email, find or create the Directus user,
 * issue a single-use token, mail the link.
 *
 * Answers "is creating users via the service token pleasant or awkward?"
 */
export default defineEventHandler(async (event) => {
  const body = await readBody<{ email?: string }>(event)
  const email = body?.email?.trim().toLowerCase()

  if (!email || !email.includes('@')) {
    throw createError({ statusCode: 400, statusMessage: 'A valid email address is required.' })
  }

  const directus = useDirectus()
  const config = useRuntimeConfig()

  const existing = await directus.request(
    readUsers({ filter: { email: { _eq: email } }, limit: 1, fields: ['id', 'email'] }),
  ) as unknown as Array<{ id: string, email: string }>

  let user = existing[0]

  if (!user) {
    user = await directus.request(
      createUser({ email, status: 'active' }),
    ) as unknown as { id: string, email: string }
    console.info('[auth] created user', { email, id: user.id })
  }

  const rawToken = await issueLoginToken(user.id, email)
  const link = `${config.public.siteUrl}/api/auth/spike/verify?token=${encodeURIComponent(rawToken)}`

  await sendMagicLink(email, link)

  // Deliberately does not reveal whether the address was already known.
  return { sent: true }
})
