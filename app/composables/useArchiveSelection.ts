/**
 * Which clip the modal is showing, and how to step through the archive.
 *
 * Shared by the grid and the galaxy so both get the same prev/next semantics
 * for free — stepping moves through the *displayed* order, so it respects the
 * current search, bin filter and shuffle rather than the underlying dataset.
 */
export function useArchiveSelection() {
  const archive = useArchive()
  const openId = useState<string | null>('archive:openClip', () => null)

  const index = computed(() =>
    openId.value ? archive.displayedIds.value.indexOf(openId.value) : -1,
  )

  const item = computed(() => (openId.value ? archive.getItem(openId.value) : undefined))

  const hasPrev = computed(() => index.value > 0)
  const hasNext = computed(
    () => index.value >= 0 && index.value < archive.displayedIds.value.length - 1,
  )

  function open(id: string): void {
    openId.value = id
  }

  function close(): void {
    openId.value = null
  }

  function step(delta: number): void {
    const ids = archive.displayedIds.value
    const next = index.value + delta
    if (next < 0 || next >= ids.length) return
    openId.value = ids[next] ?? null
  }

  return {
    openId,
    item,
    hasPrev,
    hasNext,
    open,
    close,
    prev: () => step(-1),
    next: () => step(1),
  }
}
