/**
 * One page, by path, with its blocks.
 *
 * Public and published-only. Draft content is not reachable here at all — the
 * preview route is separate and token-guarded, so there is no `?draft=true`
 * for someone to guess. (Phase 4 §4.7.)
 */
export default defineEventHandler(async (event) => {
  const path = String(getQuery(event)['path'] ?? '/')

  const page = await getPageByPath(path, false)

  if (!page) {
    throw createError({ statusCode: 404, statusMessage: 'Page not found' })
  }

  return page
})
