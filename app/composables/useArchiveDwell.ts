/**
 * How long someone actually looked at the archive.
 *
 * ── Why this exists instead of a clip-played event ──────────────────────────
 *
 * The obvious instrumentation — one event per clip played — is wrong here, for
 * two separate reasons. The feed AUTOPLAYS as you scroll, so the event fires
 * without anyone choosing anything and measures scrolling rather than
 * attention. And on a 30,000-clip archive it is volume-explosive: a single
 * engaged visit would emit hundreds of rows.
 *
 * Dwell time is the proxy, and it is a better measure of the thing anyway.
 * (ADR-006)
 *
 * ── What is counted ─────────────────────────────────────────────────────────
 *
 * Only time that is BOTH visible and past the advisory:
 *
 * - the timer pauses when the tab is hidden, so a forgotten background tab does
 *   not report as an afternoon of rapt attention;
 * - it does not start until the content warning is accepted, because the
 *   archive loads behind the gate (hard rule 15) and time spent reading a
 *   warning is not time spent looking at the work.
 *
 * ── Exactly one event per visit ─────────────────────────────────────────────
 *
 * `seconds` is the total across every visible stretch, sent once. Partial
 * flushes on each hide would double-count on any dashboard that sums them, and
 * would make the bucket label meaningless per row.
 */

/** Below this, it was a bounce or a mis-click, and the row is noise. */
const MINIMUM_SECONDS = 2

/**
 * A coarse label alongside the raw number. Umami's UI groups by property value,
 * so a free-running integer produces one bucket per visit and no chart at all;
 * `seconds` stays for anything that wants to sum or average.
 */
function bucketOf(seconds: number): string {
  if (seconds < 10) return '0-10s'
  if (seconds < 30) return '10-30s'
  if (seconds < 60) return '30-60s'
  if (seconds < 300) return '1-5m'
  if (seconds < 900) return '5-15m'
  return '15m+'
}

export function useArchiveDwell(): void {
  const advisory = useArchiveAdvisory()
  const { view } = useArchiveView()
  const spec = useArchiveCollection()
  const { track } = useAnalytics()

  /** Milliseconds banked from stretches that have already ended. */
  let banked = 0
  /** When the current visible stretch began, or null if the clock is stopped. */
  let startedAt: number | null = null
  let flushed = false

  function resume(): void {
    if (startedAt !== null) return
    if (!advisory.accepted.value || document.hidden) return
    startedAt = performance.now()
  }

  function pause(): void {
    if (startedAt === null) return
    banked += performance.now() - startedAt
    startedAt = null
  }

  function flush(): void {
    if (flushed) return
    pause()

    const seconds = Math.round(banked / 1000)
    if (seconds < MINIMUM_SECONDS) return

    flushed = true
    // Filed against /archive explicitly — see the seam. By the time this runs
    // on a route change, `location.pathname` is already the page being
    // navigated TO, and the event would be attributed there.
    // Filed against the collection's own page — the archive and the
    // experience logs share this timer and the event name, and are told apart
    // in Umami by URL, exactly as their pageviews are.
    track('archive-dwell', { seconds, bucket: bucketOf(seconds), view: view.value }, spec.path)
  }

  function onVisibilityChange(): void {
    if (document.hidden) pause()
    else resume()
  }

  onMounted(() => {
    resume()
    document.addEventListener('visibilitychange', onVisibilityChange)
    /*
     * `pagehide`, not `beforeunload`: it fires on tab close and on bfcache
     * entry, it does not block the browser, and it is the last callback that
     * actually runs on mobile Safari. `beforeunload` is unreliable in exactly
     * the cases that matter.
     */
    window.addEventListener('pagehide', flush)
  })

  // Navigating away within the SPA — the common case, and the one `pagehide`
  // never sees.
  onBeforeUnmount(() => {
    flush()
    document.removeEventListener('visibilitychange', onVisibilityChange)
    window.removeEventListener('pagehide', flush)
  })

  // The clock starts when the warning comes down, not when the page mounts.
  watch(advisory.accepted, accepted => accepted ? resume() : pause())
}
