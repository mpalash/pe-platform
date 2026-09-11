import { parseMetrics, type SessionMetrics } from '~~/shared/utils/sessions'

/**
 * The headset's six readings over one session — from its `met.csv`, aligned to
 * the recording, for the graph under the player.
 *
 * Parsed HERE for the same reason as the cues: the CSV's first column is the
 * participant's name. What leaves the server is the duration and
 * `[{ at, values }]`. Unknown slugs are refused by readSessionCsv.
 *
 * A session with no met.csv (three have none) answers no readings, not an
 * error: the graph is simply empty.
 */
export default defineCachedEventHandler(async (event): Promise<SessionMetrics> => {
  const { entry, csv } = await readSessionCsv(getRouterParam(event, 'slug') ?? '', 'met')
  return csv ? parseMetrics(csv, entry.recorded, entry.duration) : { duration: entry.duration, readings: [] }
}, {
  name: 'experience-log-metrics',
  getKey: event => getRouterParam(event, 'slug') ?? '',
  // As the cues: written once, never changed. Bypassed in dev.
  maxAge: 60 * 60,
  shouldBypassCache: () => import.meta.dev,
})
