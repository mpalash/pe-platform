import { parseCues, type SessionCue, type SessionIndexEntry } from '~~/shared/utils/sessions'

/**
 * Which archive clip was on screen, and when, for one session — from its
 * `filenames.csv`, aligned to the recording.
 *
 * Parsed HERE rather than handed to the browser as CSV, because the CSV's
 * first column is the participant's name on every row. What leaves the server
 * is `[{ at, title }]` and nothing else.
 *
 * The slug must be one the index lists. Otherwise this route would fetch any
 * path under x_logs/ that a caller cared to name.
 *
 * A session with no filenames.csv — Jaromir's has none — answers an empty list,
 * not an error: the player simply shows no titles.
 */
export default defineCachedEventHandler(async (event): Promise<SessionCue[]> => {
  const slug = getRouterParam(event, 'slug') ?? ''
  const entry = (await readSessionIndex()).find(item => item.slug === slug) as
    | (SessionIndexEntry & { filenames?: string | null })
    | undefined

  if (!entry) throw createError({ statusCode: 404, statusMessage: 'No such session.' })
  if (!entry.filenames) return []

  let csv: string
  try {
    csv = await $fetch<string>(`${sessionMediaBase()}/${entry.filenames}`, { responseType: 'text' })
  }
  catch (cause) {
    console.error(`[experience-logs] could not read cues for ${slug}`, cause)
    throw createError({ statusCode: 502, statusMessage: 'The clip log could not be loaded.' })
  }

  return parseCues(csv, entry.recorded, entry.duration)
}, {
  name: 'experience-log-cues',
  getKey: event => getRouterParam(event, 'slug') ?? '',
  // The CSVs never change once written; an hour costs nothing. Bypassed in
  // dev, where a rerun of the pipeline should show immediately.
  maxAge: 60 * 60,
  shouldBypassCache: () => import.meta.dev,
})
