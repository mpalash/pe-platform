import type { Ref } from 'vue'
import type { MediaKind } from '~~/shared/utils/archive'

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
 * Experience-log sessions: one folder per session, written by scripts/xlog.
 * The slug is the folder name.
 */
const SESSIONS_PREFIX = 'x_logs/'
const SESSION_PLAYLIST = 'index.m3u8'
const SESSION_POSTER = 'poster.jpg'

/**
 * The container format lives here and nowhere else, and it is decided per
 * item (ADR-004): archive clips are progressive files, sessions are HLS
 * streams. No component knows which it is playing.
 */
const VIDEO_EXTENSION = '.mp4'
const POSTER_EXTENSION = '.jpg'
const STREAM_EXTENSION = '.m3u8'
const STREAM_MIME = 'application/vnd.apple.mpegurl'

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
 * here rather than in the data layer. For a session it is the folder slug.
 */
export function usePlaybackSource(
  filename: string | null | undefined,
  kind: MediaKind = 'clip',
): PlaybackSource {
  const empty: PlaybackSource = { src: null, poster: null, usingOriginFallback: false }

  if (!filename) return empty

  const media = resolveBase()
  if (!media) return empty

  if (kind === 'session') {
    // Slugs are [a-z0-9-] by construction (scripts/xlog), but encoding is
    // free and a hand-edited folder name should not become a broken URL.
    const folder = `${media.base}${SESSIONS_PREFIX}${encodeURIComponent(filename)}/`
    return {
      src: `${folder}${SESSION_PLAYLIST}`,
      poster: `${folder}${SESSION_POSTER}`,
      usingOriginFallback: media.usingOriginFallback,
    }
  }

  const stem = stripExtension(filename)

  return {
    src: `${media.base}${CLIPS_PREFIX}${encodeKey(stem)}${VIDEO_EXTENSION}`,
    poster: `${media.base}${THUMBS_PREFIX}${encodeKey(stem)}${POSTER_EXTENSION}`,
    usingOriginFallback: media.usingOriginFallback,
  }
}

/* ── Attaching a source to a <video> ─────────────────────────────────────────
 *
 * `<video :src>` plays a progressive file everywhere and an HLS stream only in
 * Safari. Chrome and Firefox need hls.js to feed the stream in through Media
 * Source Extensions. So players do not bind `:src` — they hand their element
 * and URL to `useVideoSource`, and this file decides how to connect them.
 *
 * hls.js is imported only when a stream is actually played in a browser that
 * cannot play it natively. The archive never loads it: its clips are all
 * progressive, and the dynamic import keeps the library out of every bundle
 * that does not reach it. The `light` build drops subtitles, alternate audio
 * and DRM, none of which a single-rendition session uses.
 */

function isStream(src: string): boolean {
  return new URL(src, 'https://x').pathname.endsWith(STREAM_EXTENSION)
}

/**
 * Connects `video` to `src`. Resolves to the function that disconnects it.
 *
 * Both disconnects are safe to run late — after something newer has already
 * taken the element — because each only undoes what it did: the native one
 * clears `src` only if it is still the URL it set, and hls.js only detaches its
 * own MediaSource. `isCurrent` lets a call that was waiting on the hls.js
 * import notice it has been superseded and touch nothing.
 */
async function attach(video: HTMLVideoElement, src: string, isCurrent: () => boolean): Promise<() => void> {
  const native = () => {
    video.src = src
    /*
     * `load()` is required, not decorative. Changing the source of an element
     * that is already playing does not reliably re-fetch — the browser keeps
     * decoding the old stream until told to start over. (Found in the modal,
     * where stepping to the next clip kept playing the previous one.)
     */
    video.load()
    const mine = video.src
    return () => {
      if (video.src !== mine) return
      video.removeAttribute('src')
      video.load()
    }
  }

  // Safari, including iOS, plays HLS natively; so does anything else that says so.
  if (!isStream(src) || video.canPlayType(STREAM_MIME)) return native()

  const { default: Hls } = await import('hls.js/light')
  if (!isCurrent()) return () => {}

  // No MSE either. Hand it to the element anyway: the failure is then the
  // browser's own "cannot play", visible in the player, rather than silence.
  if (!Hls.isSupported()) return native()

  const hls = new Hls()
  hls.loadSource(src)
  hls.attachMedia(video)
  return () => hls.destroy()
}

/**
 * Keeps a `<video>` pointed at a source, however that source has to be played.
 *
 * `ensure()` connects the element if it is not already connected to `src`, and
 * is safe to call on every play — the feed calls it lazily, just before
 * playing, so eighty-odd players on a page do not all fetch a playlist up
 * front. Connecting is asynchronous when hls.js has to load, so a newer
 * `ensure()` supersedes an older one still in flight: stepping quickly through
 * the modal can never leave the previous stream attached.
 */
export function useVideoSource(
  video: Readonly<Ref<HTMLVideoElement | null>>,
  src: Readonly<Ref<string | null>>,
) {
  let detach: (() => void) | null = null
  let attachedTo: string | null = null
  let inFlight: Promise<void> | null = null
  let generation = 0

  function release(): void {
    generation++
    detach?.()
    detach = null
    attachedTo = null
    inFlight = null
  }

  async function ensure(): Promise<void> {
    const el = video.value
    const url = src.value
    if (!el || !url) return
    if (attachedTo === url) return inFlight ?? undefined

    release()
    const mine = generation
    const isCurrent = () => mine === generation
    attachedTo = url
    inFlight = attach(el, url, isCurrent).then((disconnect) => {
      if (isCurrent()) detach = disconnect
      else disconnect() // superseded meanwhile; safe, see attach()
    })
    return inFlight
  }

  onBeforeUnmount(release)

  return { ensure, release }
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
