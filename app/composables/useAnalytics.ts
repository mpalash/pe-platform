/**
 * The one place that knows analytics exist.
 *
 * Same shape of seam as `usePlaybackSource`: every call site names an event,
 * nothing outside this file touches `window.umami`, and swapping the tool is a
 * one-file change rather than a search across components. `test/analytics.spec.ts`
 * holds that line.
 *
 * ── Never load-bearing ──────────────────────────────────────────────────────
 *
 * `track()` is a no-op when the tracker is absent, and the tracker is absent
 * far more often than it is present: it is unconfigured in a fresh clone, it is
 * blocked by every content blocker worth having, and it is gone entirely if the
 * Umami container is down. All three are NORMAL. Nothing here throws, nothing
 * here awaits, and no UI may branch on whether an event was sent. (ADR-006)
 *
 * ── What must never be passed ───────────────────────────────────────────────
 *
 * No email addresses, no user ids, no session identifiers, and no clip ids for
 * anything a person chose to watch. The analytics database is not covered by
 * the consent story that makes the rest of this cookieless, and "which violent
 * clip did this visitor watch" is exactly the record this platform should not
 * be keeping.
 *
 * Search terms ARE recorded, decided deliberately (ADR-006). The line is not
 * "nothing a visitor typed" but "nothing that ties back to a visitor": Umami
 * keeps no identifier that outlives the day, so the terms are a list of what
 * the archive was asked for, not a list of what anyone in particular asked.
 */

/**
 * The complete event vocabulary. A union rather than a string so a typo fails
 * `pnpm typecheck` instead of quietly creating a second event that looks almost
 * like the real one and splits every chart in half.
 */
export type AnalyticsEvent
  /** Content warning resolved. `outcome: accepted | declined`. */
  = | 'advisory'
  /**
   * Time spent looking at the archive — the deliberate stand-in for per-clip
   * play events, which the feed's autoplay would fire without anyone choosing
   * anything. See `useArchiveDwell`. (ADR-006)
   */
    | 'archive-dwell'
  /** Feed / grid / galaxy switch. */
    | 'archive-view'
  /** A search ran. The TERM IS NOT RECORDED — see the header. */
    | 'archive-search'
  /** Magic link requested. Pairs with the two below to give a funnel. */
    | 'signin-requested'
    | 'signin-completed'
    | 'signin-failed'
  /** Someone followed a clip out to its original source. */
    | 'source-out'

/** Low-cardinality labels only. Umami stores these as jsonb. */
export type AnalyticsProps = Record<string, string | number | boolean>

interface UmamiTracker {
  track: {
    (event: string, props?: AnalyticsProps): void
    /**
     * The override form. It has to be a FUNCTION that receives the tracker's
     * own payload and returns a modified one — passing the same object
     * directly is accepted, returns a Promise, and silently records nothing.
     * Verified against Umami 3.3.1; there is no error to catch.
     */
    (build: (payload: Record<string, unknown>) => Record<string, unknown>): void
  }
}

export function useAnalytics() {
  /**
   * @param url Overrides the page the event is filed under. Needed for anything
   * fired while LEAVING a page: the tracker reads `location.pathname` when it is
   * called, and Vue Router has already changed it by `onBeforeUnmount`, so the
   * archive's dwell event lands on whatever page you navigated to. An event
   * attributed to the wrong page is worse than no event — it is wrong in a way
   * that looks fine on a dashboard.
   */
  function track(event: AnalyticsEvent, props?: AnalyticsProps, url?: string): void {
    if (!import.meta.client) return

    const tracker = (window as unknown as { umami?: UmamiTracker }).umami
    if (!tracker?.track) return

    try {
      if (url) tracker.track(payload => ({ ...payload, name: event, data: props, url }))
      else tracker.track(event, props)
    }
    catch {
      // Deliberately swallowed. An analytics failure is not a user-facing
      // failure, and a console error here would be noise on every page load
      // for anyone running a content blocker.
    }
  }

  return { track }
}
