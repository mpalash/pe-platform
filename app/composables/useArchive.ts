import MiniSearch from 'minisearch'
import type { ShallowRef } from 'vue'
import type { ArchiveItem, ArchiveSource, RawEdit } from '~~/shared/utils/archive'
import type { CollectionId, CollectionSpec } from '~~/shared/utils/collections'

/**
 * Archive state: loading, searching, filtering, ordering.
 *
 * Ported from pe-vue's Vuex `playlist` module. Vuex is not in this project's
 * stack, and it is not needed — `useState` gives the same shared, SSR-safe
 * store in a fraction of the code. lodash and Immutable are gone too: `filter`,
 * `includes`, `intersection` and `shuffle` are all one-liners now, and a Map
 * keyed by id is what Immutable was standing in for.
 *
 * The archive is PUBLIC (hard rule 4). Nothing here gates on a session.
 */

/**
 * How each collection's items arrive. The only per-collection behaviour that is
 * code rather than data, so it lives here beside the store rather than in
 * shared/utils/collections.ts.
 */
const LOADERS: Record<CollectionId, () => Promise<{ items: ArchiveItem[], sources: ArchiveSource[] }>> = {
  async archive() {
    // Served as a static file rather than bundled — 18MB of JSON has no
    // business in a JS bundle, and this way it is cached and compressed.
    const records = await $fetch<RawEdit[]>('/data/edits.json')

    // assignStableIds is load-bearing: the export contains empty and
    // duplicated uids, and MiniSearch throws on a duplicate id — which took
    // down the entire feed rather than the affected records.
    return { items: assignStableIds(records.map(shapeEdit)), sources: collectSources(records) }
  },

  async sessions() {
    // Shaped server-side, so participants' names never reach the browser —
    // see server/api/experience-logs.get.ts.
    return { items: await $fetch<ArchiveItem[]>('/api/experience-logs'), sources: [] }
  },
}

/**
 * The store for the collection the current page browses.
 *
 * Every key is namespaced by collection, so the archive and the experience
 * logs keep separate filters, saved items and search index — searching one
 * does not filter the other. The archive's namespace is `archive`, as every
 * key was before there was a second collection.
 *
 * Pass `spec` only from outside a page (tests, scripts); components get the
 * collection their page declared — see useArchiveCollection.
 */
export function useArchive(spec: CollectionSpec = useArchiveCollection()) {
  const ns = spec.id
  const items = useState<Map<string, ArchiveItem>>(`${ns}:items`, () => new Map())
  const allIds = useState<string[]>(`${ns}:allIds`, () => [])
  const sources = useState<ArchiveSource[]>(`${ns}:sources`, () => [])
  const loading = useState<boolean>(`${ns}:loading`, () => false)
  const error = useState<string | null>(`${ns}:error`, () => null)

  const searchTerm = useState<string>(`${ns}:searchTerm`, () => '')
  const binRange = useState<[number, number] | null>(`${ns}:binRange`, () => null)
  const shuffled = useState<boolean>(`${ns}:shuffled`, () => spec.defaultShuffled)
  const bookmarksOnly = useState<boolean>(`${ns}:bookmarksOnly`, () => false)
  const bookmarks = useState<string[]>(`${ns}:bookmarks`, () => [])

  /**
   * The MiniSearch index is deliberately NOT in useState — it is a large object
   * graph over 30,000 documents, and useState would serialise it into the SSR
   * payload and ship it to the browser twice.
   *
   * But it still has to be SHARED. A bare `shallowRef` here would be recreated
   * on every `useArchive()` call, so the toolbar and the feed would each hold
   * their own: the feed builds the index, the toolbar's stays null, and the
   * toolbar silently reports the unfiltered count while the feed shows filtered
   * results. Stashing it on the Nuxt app instance shares it without
   * serialising it, and without leaking between requests during SSR the way a
   * module-level variable would.
   */
  const nuxt = useNuxtApp() as unknown as {
    _archiveIndexes?: Partial<Record<CollectionId, ShallowRef<MiniSearch<ArchiveItem> | null>>>
  }
  nuxt._archiveIndexes ??= {}
  nuxt._archiveIndexes[ns] ??= shallowRef<MiniSearch<ArchiveItem> | null>(null)
  const index = nuxt._archiveIndexes[ns]!

  /** Shuffle order is held separately so re-filtering does not reshuffle. */
  const shuffleSeed = useState<number>(`${ns}:shuffleSeed`, () => 0)

  async function load(): Promise<void> {
    if (items.value.size > 0 || loading.value) return

    loading.value = true
    error.value = null

    try {
      const loaded = await LOADERS[ns]()

      items.value = new Map(loaded.items.map(item => [item.id, item]))
      allIds.value = loaded.items.map(item => item.id)
      sources.value = loaded.sources

      buildIndex(loaded.items)
    }
    catch (cause) {
      error.value = cause instanceof Error ? cause.message : `Failed to load ${spec.title}.`
      console.error(`[${ns}] load failed`, cause)
    }
    finally {
      loading.value = false
    }
  }

  function buildIndex(shaped: ArchiveItem[]): void {
    const miniSearch = new MiniSearch<ArchiveItem>({
      idField: 'id',
      fields: spec.searchFields,
      storeFields: ['id'],
      searchOptions: {
        boost: { name: 2, description: 1 },
        fuzzy: 0.2,
        prefix: true,
      },
    })

    miniSearch.addAll(shaped)
    index.value = miniSearch
  }

  /**
   * The displayed set, derived rather than stored.
   *
   * pe-vue recomputed this imperatively into `displayedIds` after every change,
   * which meant every new filter needed a matching dispatch. A computed cannot
   * fall out of sync.
   */
  const displayedIds = computed<string[]>(() => {
    let ids: string[] = allIds.value

    if (searchTerm.value.trim() && index.value) {
      ids = index.value
        .search(searchTerm.value, { fields: spec.searchFields })
        .map(result => String(result.id))
    }

    const activeBins = binsInRange(binRange.value)
    if (activeBins.size > 0) {
      ids = ids.filter((id) => {
        const bin = items.value.get(id)?.bin
        return bin ? activeBins.has(bin) : false
      })
    }

    if (bookmarksOnly.value) {
      const marked = new Set(bookmarks.value)
      ids = ids.filter(id => marked.has(id))
    }

    if (shuffled.value) {
      // Reading the seed makes shuffling reactive to the toggle without
      // reshuffling on every unrelated filter change.
      void shuffleSeed.value
      ids = shuffle(ids)
    }

    return ids
  })

  const count = computed(() => displayedIds.value.length)
  const total = computed(() => allIds.value.length)

  function getItem(id: string): ArchiveItem | undefined {
    return items.value.get(id)
  }

  /* ── filters ───────────────────────────────────────────────────────────── */

  function setSearchTerm(term: string): void {
    searchTerm.value = term ?? ''
  }

  function setBinRange(range: [number, number] | null): void {
    binRange.value = range
  }

  function toggleShuffle(): void {
    shuffled.value = !shuffled.value
    if (shuffled.value) shuffleSeed.value++
  }

  function reshuffle(): void {
    shuffleSeed.value++
  }

  function clearFilters(): void {
    searchTerm.value = ''
    binRange.value = null
    bookmarksOnly.value = false
  }

  const hasActiveFilters = computed(() =>
    Boolean(searchTerm.value.trim()) || binRange.value !== null || bookmarksOnly.value,
  )

  /* ── bookmarks ─────────────────────────────────────────────────────────── */

  /**
   * Local-only, deliberately.
   *
   * pe-vue stored bookmarks in PocketBase against a signed-in user. This
   * platform has no accounts until Phase 5, and ADR-002 makes Directus the user
   * store when it does — so wiring bookmarks to a backend now would mean
   * building the wrong integration twice. localStorage keeps the feature
   * working for a visitor today and is trivial to migrate later.
   */
  const BOOKMARKS_KEY = `pe:${ns}:bookmarks`

  function loadBookmarks(): void {
    if (!import.meta.client) return

    try {
      const stored = localStorage.getItem(BOOKMARKS_KEY)
      bookmarks.value = stored ? (JSON.parse(stored) as string[]) : []
    }
    catch {
      bookmarks.value = []
    }
  }

  function persistBookmarks(): void {
    if (!import.meta.client) return

    try {
      localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(bookmarks.value))
    }
    catch {
      // A full or disabled localStorage is not worth breaking playback over.
    }
  }

  function isBookmarked(id: string): boolean {
    return bookmarks.value.includes(id)
  }

  function toggleBookmark(id: string): void {
    bookmarks.value = isBookmarked(id)
      ? bookmarks.value.filter(existing => existing !== id)
      : [...bookmarks.value, id]

    persistBookmarks()
  }

  function toggleBookmarksOnly(): void {
    bookmarksOnly.value = !bookmarksOnly.value
  }

  return {
    // which collection this is
    spec,
    // state
    loading,
    error,
    sources,
    searchTerm,
    binRange,
    shuffled,
    bookmarksOnly,
    bookmarks,
    // derived
    displayedIds,
    count,
    total,
    hasActiveFilters,
    // actions
    load,
    getItem,
    setSearchTerm,
    setBinRange,
    toggleShuffle,
    reshuffle,
    clearFilters,
    loadBookmarks,
    isBookmarked,
    toggleBookmark,
    toggleBookmarksOnly,
  }
}
