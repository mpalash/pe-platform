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
