import { parseCues, type SessionCue } from '~~/shared/utils/sessions'

/**
 * Which archive clip was on screen, and when, for one session — from its
 * `filenames.csv`, aligned to the recording.
 *
 * Parsed HERE rather than handed to the browser as CSV, because the CSV's
 * first column is the participant's name on every row. What leaves the server
 * is `[{ at, title }]` and nothing else. Unknown slugs are refused by
 * readSessionCsv (server/utils/session-index.ts).
 *
 * A session with no filenames.csv — Jaromir's has none — answers an empty list,
 * not an error: the player simply shows no titles.
 */
export default defineCachedEventHandler(async (event): Promise<SessionCue[]> => {
  const { entry, csv } = await readSessionCsv(getRouterParam(event, 'slug') ?? '', 'filenames')
  return csv ? parseCues(csv, entry.recorded, entry.duration) : []
}, {
  name: 'experience-log-cues',
  getKey: event => getRouterParam(event, 'slug') ?? '',
  // The CSVs never change once written; an hour costs nothing. Bypassed in
  // dev, where a rerun of the pipeline should show immediately.
  maxAge: 60 * 60,
  shouldBypassCache: () => import.meta.dev,
})
