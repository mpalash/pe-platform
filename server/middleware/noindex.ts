/**
 * Keeps a non-production deployment out of search results.
 *
 * `next.purgatoryedit.com` serves the same archive as `www`, which still
 * points at the pe-vue build. Two crawlable copies of the same content is a
 * duplicate-content problem, and the one that gets suppressed is not
 * necessarily the one you wanted.
 *
 * Why a header and not robots.txt: `Disallow` blocks crawling, not indexing —
 * a blocked URL can still appear in results, without a snippet, which is the
 * worst of both. `X-Robots-Tag: noindex` is the instruction that actually
 * removes it. Same mechanism the `/preview` route rule already uses.
 *
 * Why middleware and not a route rule: route rules match paths, and this is a
 * property of the DEPLOYMENT, not of any path. One variable on the staging
 * service covers every route, including the generated *.up.railway.app hosts
 * that would otherwise be a third indexable copy.
 *
 * Set NUXT_NOINDEX=true on staging. Production leaves it unset — and the day
 * this service becomes production, removing the variable is the whole change.
 */
export default defineEventHandler((event) => {
  if (!useRuntimeConfig(event).noindex) return

  setResponseHeader(event, 'X-Robots-Tag', 'noindex, nofollow')
})
