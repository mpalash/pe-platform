import { shapeSessions } from '~~/shared/utils/sessions'

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
 * Cached for five minutes; bypassed in dev, so a rerun of the xlog pipeline
 * shows at once. Reading and the media base live in server/utils/session-index.ts,
 * shared with the per-session cues.
 */
export default defineCachedEventHandler(async () => {
  return shapeSessions(await readSessionIndex())
}, {
  name: 'experience-logs',
  maxAge: 60 * 5,
  shouldBypassCache: () => import.meta.dev,
})
