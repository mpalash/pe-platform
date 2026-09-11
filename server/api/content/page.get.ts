/**
 * One page, by path, with its blocks.
 *
 * Public and published-only. Draft content is not reachable here at all — the
 * preview route is separate and token-guarded, so there is no `?draft=true`
 * for someone to guess. (Phase 4 §4.7.)
 */
export default defineEventHandler(async (event) => {
  const path = String(getQuery(event)['path'] ?? '/')

  let page: Awaited<ReturnType<typeof getPageByPath>>
  try {
    page = await getPageByPath(path, false)
  }
  catch (cause) {
    // Directus unreachable or failing. Said as such, so the page can tell an
    // outage from a missing page — see [...slug].vue.
    console.error('[content/page] Directus request failed', cause)
    throw createError({ statusCode: 503, statusMessage: 'Content is temporarily unavailable' })
  }

  if (!page) {
    throw createError({ statusCode: 404, statusMessage: 'Page not found' })
  }

  return page
})
