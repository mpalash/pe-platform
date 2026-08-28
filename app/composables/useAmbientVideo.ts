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
   * Dismissed for the session.
   *
   * Not persisted: the CMS toggle is the editorial control, and a dismissal
   * that outlived the visit would quietly override an editor's decision on
   * every page for ever. This is an escape hatch for right now.
   */
  const dismissed = useState('ambient:dismissed', () => false)

  /**
   * Never on the archive. It has its own players, its own advisory gate, and a
   * second video playing over the galaxy would compete with all of them.
   */
  const allowedHere = computed(() => !route.path.startsWith('/archive'))

  const enabled = computed(() =>
    allowedHere.value && !dismissed.value && (perPage.value[route.path] ?? true),
  )

  return {
    enabled,
    dismiss: () => { dismissed.value = true },
    /** Called by a page that has an authored answer for its own path. */
    setForPath: (path: string, value: boolean) => { perPage.value[path] = value },
  }
}
