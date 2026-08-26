/**
 * Which of the three archive views is showing.
 *
 * Lives in a composable rather than on the page because the switcher moved into
 * the toolbar — the control and the thing it controls are now in different
 * components, and neither owns the other.
 */
export type ArchiveView = 'feed' | 'grid' | 'galaxy'

export const ARCHIVE_VIEWS: Array<{ id: ArchiveView, label: string }> = [
  { id: 'feed', label: 'Feed' },
  { id: 'grid', label: 'Grid' },
  { id: 'galaxy', label: 'Galaxy' },
]

export function useArchiveView() {
  // Persisted: a chosen view is a preference, not a per-visit decision.
  const view = usePersistentState<ArchiveView>('archive:view', () => 'feed')

  return { view, views: ARCHIVE_VIEWS }
}
