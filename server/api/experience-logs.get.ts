import { shapeSessions, type SessionIndexEntry } from '~~/shared/utils/sessions'

/**
 * The experience-log sessions, shaped as archive items.
 *
 * Read server-side from `x_logs/index.json` in the bucket (written by
 * scripts/xlog/finalize.sh) rather than by the browser, for two reasons:
 *
 * - The index names participants, in the original filenames. `shapeSessions`
 *   drops them, and doing that HERE means they never reach a browser at all.
 *   Fetched client-side, every visitor would download the names and the paths
 *   to their headset data, whatever the page chose to show.
 * - No CORS and no second copy of the media-base logic in the client.
 *
 * Through the CDN whenever one is configured. The S3 origin only under the same
 * explicit development opt-in usePlaybackSource honours — this is 60KB of JSON,
 * not video, but the rule is simpler kept whole than kept mostly.
 *
 * Cached for five minutes. Bypassed in dev, because the cache persists to disk
 * and survives restarts (see CLAUDE.md), which looks exactly like a rerun of
 * the xlog pipeline not having worked.
 */
export default defineCachedEventHandler(async () => {
  const media = useRuntimeConfig().public
  const cdn = String(media.mediaBase ?? '').trim()
  const origin = media.mediaAllowOriginFallback ? String(media.mediaOrigin ?? '').trim() : ''
  const base = cdn || origin

  if (!base) {
    throw createError({ statusCode: 503, statusMessage: 'Media is not configured.' })
  }

  let index: { items?: SessionIndexEntry[] }
  try {
    index = await $fetch(`${base.replace(/\/$/, '')}/x_logs/index.json`)
  }
  catch (cause) {
    console.error('[experience-logs] could not read x_logs/index.json', cause)
    throw createError({ statusCode: 502, statusMessage: 'The experience logs could not be loaded.' })
  }

  return shapeSessions(index.items ?? [])
}, {
  name: 'experience-logs',
  maxAge: 60 * 5,
  shouldBypassCache: () => import.meta.dev,
})
