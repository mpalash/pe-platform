/**
 * Draft preview, for Directus Live Preview only. (Phase 4 §4.6.)
 *
 * Kept deliberately separate from /api/content/page rather than adding a
 * `?draft=true` flag to it: a public endpoint that can be talked into serving
 * unpublished content is one forgotten condition away from a leak. This route
 * has one job and refuses without the token.
 */
export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const config = useRuntimeConfig()

  const supplied = String(query['token'] ?? '')

  if (!config.previewToken || supplied !== config.previewToken) {
    // 404 rather than 401 — no reason to confirm the route exists.
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }

  const id = String(query['id'] ?? '')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing id' })

  const page = await getPageById(id)

  if (!page) throw createError({ statusCode: 404, statusMessage: 'Page not found' })

  return page
})
