/**
 * The one place that knows how an archive item becomes a URL.
 *
 * Hard rule 5: never reference a container format outside this composable.
 * Media is MP4 today and HLS later; this is the seam that makes that a
 * one-place change, applied per item. A `.mp4` literal in a component is a bug.
 *
 * Hard rule 3: never serve video directly from S3. Egress is $0.09/GB and it is
 * billed per view. Everything goes through CloudFront.
 *
 * ── On the origin fallback ────────────────────────────────────────────────
 * The ported implementation (pe-vue) points straight at
 * `aam-purgatory-archive.s3.eu-north-1.amazonaws.com`. There is no CloudFront
 * distribution yet — that is Phase 3 §3.2 — but hard rule 2 says a feature that
 * cannot be exercised locally is not done, and a player with no media is not a
 * port.
 *
 * So: `mediaBase` (a CDN) is used whenever it is set. The S3 origin is used only
 * when someone explicitly opts in via NUXT_PUBLIC_MEDIA_ALLOW_ORIGIN_FALLBACK,
 * it warns every time, and `assertMediaConfigured()` refuses it outside
 * development. The rule stays enforced where it costs money.
 */

export interface PlaybackSource {
  /** Playable URL, or null when media is not configured. */
  src: string | null
  /** Poster/thumbnail URL, or null. */
  poster: string | null
  /** True when the URL came from the S3 origin rather than a CDN. */
  usingOriginFallback: boolean
}

/** Directory layout inside the bucket. Ported from pe-vue's edits.js. */
const CLIPS_PREFIX = 'Clips+HD/'
const THUMBS_PREFIX = 'Thumbnails/'

/**
 * The container format lives here and nowhere else. When HLS arrives, this
 * becomes a per-item decision and no component changes.
 */
const VIDEO_EXTENSION = '.mp4'
const POSTER_EXTENSION = '.jpg'

/**
 * pe-vue encodes spaces as `+` before URI-encoding — the objects were uploaded
 * with that naming, so this is not cosmetic, it is the key.
 */
function encodeKey(name: string): string {
  return encodeURI(name.replace(/ {2,}/g, ' ').replace(/ /g, '+'))
}

function stripExtension(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(0, dot) : name
}

interface MediaConfig {
  base: string
  usingOriginFallback: boolean
}

function resolveBase(): MediaConfig | null {
  const config = useRuntimeConfig().public

  const cdn = String(config.mediaBase ?? '').trim()
  if (cdn) return { base: cdn.replace(/\/$/, '') + '/', usingOriginFallback: false }

  const origin = String(config.mediaOrigin ?? '').trim()
  const allowFallback = Boolean(config.mediaAllowOriginFallback)

  if (!origin || !allowFallback) return null

  if (import.meta.dev && import.meta.client) {
    console.warn(
      '[media] serving from the S3 origin, not a CDN. This is billed per view at '
      + '$0.09/GB and must never happen in a deployed environment. '
      + 'Set NUXT_PUBLIC_MEDIA_BASE to a CloudFront distribution.',
    )
  }

  return { base: origin.replace(/\/$/, '') + '/', usingOriginFallback: true }
}

/**
 * Builds playback URLs for one archive item.
 *
 * `filename` is the raw value from the archive metadata — it sometimes carries
 * an extension and sometimes does not, which is why extension handling belongs
 * here rather than in the data layer.
 */
export function usePlaybackSource(filename: string | null | undefined): PlaybackSource {
  const empty: PlaybackSource = { src: null, poster: null, usingOriginFallback: false }

  if (!filename) return empty

  const media = resolveBase()
  if (!media) return empty

  const stem = stripExtension(filename)

  return {
    src: `${media.base}${CLIPS_PREFIX}${encodeKey(stem)}${VIDEO_EXTENSION}`,
    poster: `${media.base}${THUMBS_PREFIX}${encodeKey(stem)}${POSTER_EXTENSION}`,
    usingOriginFallback: media.usingOriginFallback,
  }
}

/**
 * True when media can be played at all. The archive browser stays useful
 * without it — metadata, search and filtering all work — so this is a banner,
 * not an error.
 */
export function useMediaConfigured(): { configured: boolean, usingOriginFallback: boolean } {
  const media = resolveBase()
  return {
    configured: media !== null,
    usingOriginFallback: media?.usingOriginFallback ?? false,
  }
}
