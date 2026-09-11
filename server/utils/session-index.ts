import type { SessionIndexEntry } from '~~/shared/utils/sessions'

/**
 * Reading the experience-log sessions from the bucket, server-side.
 *
 * Shared by the sessions list and the per-session cues. Through the CDN
 * whenever one is configured; the S3 origin only under the same explicit
 * development opt-in usePlaybackSource honours.
 */
export function sessionMediaBase(): string {
  const media = useRuntimeConfig().public
  const cdn = String(media.mediaBase ?? '').trim()
  const origin = media.mediaAllowOriginFallback ? String(media.mediaOrigin ?? '').trim() : ''
  const base = (cdn || origin).replace(/\/$/, '')

  if (!base) throw createError({ statusCode: 503, statusMessage: 'Media is not configured.' })
  return base
}

/** x_logs/index.json, written by scripts/xlog/finalize.sh. */
export async function readSessionIndex(): Promise<SessionIndexEntry[]> {
  const base = sessionMediaBase()
  try {
    const index = await $fetch<{ items?: SessionIndexEntry[] }>(`${base}/x_logs/index.json`)
    return index.items ?? []
  }
  catch (cause) {
    console.error('[experience-logs] could not read x_logs/index.json', cause)
    throw createError({ statusCode: 502, statusMessage: 'The experience logs could not be loaded.' })
  }
}

/**
 * One of a session's CSVs, as text — or null when the session has none.
 *
 * The slug must be one the index lists, or this answers 404. Otherwise the
 * routes built on it would fetch any path under x_logs/ a caller cared to name.
 *
 * Callers parse the text and send on only what they parsed — never the CSV
 * itself, whose first column is the participant's name.
 */
export async function readSessionCsv(
  slug: string,
  which: 'filenames' | 'met',
): Promise<{ entry: SessionIndexEntry, csv: string | null }> {
  const entry = (await readSessionIndex()).find(item => item.slug === slug) as
    | (SessionIndexEntry & Partial<Record<'filenames' | 'met', string | null>>)
    | undefined

  if (!entry) throw createError({ statusCode: 404, statusMessage: 'No such session.' })

  const path = entry[which]
  if (!path) return { entry, csv: null }

  try {
    return { entry, csv: await $fetch<string>(`${sessionMediaBase()}/${path}`, { responseType: 'text' }) }
  }
  catch (cause) {
    console.error(`[experience-logs] could not read ${which}.csv for ${slug}`, cause)
    throw createError({ statusCode: 502, statusMessage: 'The session log could not be loaded.' })
  }
}
