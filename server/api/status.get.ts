import { serverInfo } from '@directus/sdk'

/**
 * The trivial public read path (Phase 1 §1.4): proves Nuxt reaches Directus
 * through a server route, end to end, with nothing sensitive crossing over.
 *
 * Note what is NOT returned: no token, no connection string, no admin detail.
 * A public endpoint reports only that the link works.
 */
export default defineEventHandler(async () => {
  const directus = useDirectus()

  try {
    const info = await directus.request(serverInfo()) as {
      project?: { project_name?: string }
      version?: string
    }

    return {
      connected: true,
      project: info.project?.project_name ?? null,
      directusVersion: info.version ?? null,
      checkedAt: new Date().toISOString(),
    }
  }
  catch (error) {
    // A dead backend is a 503, not a 500 — it is upstream, not us.
    throw createError({
      statusCode: 503,
      statusMessage: 'Directus is unreachable. Is `docker compose up` running?',
      cause: error,
    })
  }
})
