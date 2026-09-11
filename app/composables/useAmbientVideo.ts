/**
 * Whether the floating ambient player is shown on the current page.
 *
 * The player is mounted once in the layout so it survives navigation, but
 * whether it should appear is a property of the PAGE — a Directus field that
 * an editor sets per page. Those two live in different components, so the
 * answer is passed through shared state rather than props.
 *
 * Keyed by path, not a single boolean. A bare flag set by one page stays set
 * after navigating to a route that never sets it — /source-index, say — and the
 * player would inherit whatever the last Directus page happened to say. Keying
 * by path means an unanswered route falls back to the default instead of
 * inheriting a stale answer.
 */
export function useAmbientVideo() {
  const route = useRoute()

  /** Path → the page's setting. Absent means the page never expressed one. */
  const perPage = useState<Record<string, boolean>>('ambient:perPage', () => ({}))

  /**
   * Never on a page that renders the archive browser — the archive or the
   * experience logs. Both have their own players and their own advisory gate,
   * and a second video playing over them would compete with all of it.
   */
  const allowedHere = computed(() => !isCollectionPath(route.path))

  /*
   * No per-visitor dismissal. Whether the player appears is decided by an
   * editor, per page, in Directus — a viewer-side override would silently
   * countermand that on every page for the rest of the visit.
   */
  const enabled = computed(() =>
    allowedHere.value && (perPage.value[route.path] ?? true),
  )

  /**
   * The clip and position to resume from.
   *
   * The player is mounted in the layout and normally survives navigation
   * outright — same element, same clip, uninterrupted. It does NOT survive
   * routing through a page where it is hidden: /archive, or any page with the
   * CMS toggle off. Those unmount the component, and remounting it picks a
   * fresh clip from zero.
   *
   * Holding the position out here instead means the round trip resumes where it
   * left off rather than starting again, which is what "keeps playing across
   * pages" has to mean if it is to survive the archive.
   *
   * Not persisted to storage: this is continuity within a visit, and resuming
   * a stranger's half-watched clip on a fresh load would be odd rather than
   * seamless.
   */
  const resume = useState<{ id: string, time: number } | null>('ambient:resume', () => null)

  return {
    enabled,
    resume,
    /** Called by a page that has an authored answer for its own path. */
    setForPath: (path: string, value: boolean) => { perPage.value[path] = value },
  }
}
