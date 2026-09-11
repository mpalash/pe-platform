/**
 * Which view is showing, and which views the current collection offers.
 *
 * Lives in a composable rather than on the page because the switcher is in the
 * toolbar — the control and the thing it controls are in different
 * components, and neither owns the other.
 *
 * The view types and their labels live in shared/utils/collections.ts, beside
 * the one list that says which collection offers which.
 */
export function useArchiveView() {
  const spec = useArchiveCollection()

  // Persisted per collection: a chosen view is a preference, not a per-visit
  // decision, and it is a preference about THAT collection. The archive's key
  // is the one it always had, so an existing visitor keeps their choice.
  // Only a view someone actually chose is stored, so changing a collection's
  // `defaultView` reaches every visitor who never picked one.
  const stored = usePersistentState<ArchiveView>(`${spec.id}:view`, () => spec.defaultView)

  /*
   * Only ever a view this collection offers. A stored value the collection
   * does not have — from an older build, a hand-edited localStorage, or a
   * view later removed — would otherwise mount nothing at all: the page shows
   * neither feed nor grid and looks broken with no error anywhere.
   */
  const view = computed<ArchiveView>({
    get: () => (spec.views.includes(stored.value) ? stored.value : spec.defaultView),
    set: (next) => { if (spec.views.includes(next)) stored.value = next },
  })

  const views = ARCHIVE_VIEWS.filter(option => spec.views.includes(option.id))

  return { view, views }
}
