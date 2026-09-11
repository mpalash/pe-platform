/**
 * The collections the archive browser can show, and everything that differs
 * between them.
 *
 * `/archive` and `/experience-logs` are the same browser — the same toolbar,
 * feed, grid, modal, advisory, saved items and search — and this is the ONLY
 * place their differences are written down. A difference expressed anywhere
 * else, as a `route.path === …` in a component, is how two pages that are meant
 * to behave identically slowly stop doing so.
 *
 * Pure data, so the tests can hold it without a Nuxt context.
 */

export type ArchiveView = 'feed' | 'grid' | 'galaxy'

export const ARCHIVE_VIEWS: Array<{ id: ArchiveView, label: string }> = [
  { id: 'feed', label: 'Feed' },
  { id: 'grid', label: 'Grid' },
  { id: 'galaxy', label: 'Galaxy' },
]

export type CollectionId = 'archive' | 'sessions'

export interface CollectionSpec {
  /**
   * Namespace for every piece of state the browser keeps — filters, saved
   * items, the chosen view, the open item. The archive's is `archive`, which is
   * what it was before there was more than one collection, so a visitor's
   * saved clips and view preference survive the change.
   */
  id: CollectionId
  /** The route that shows it. Also where its analytics are filed. */
  path: string
  /** "the archive" — for sentences such as "Loading the archive…". */
  title: string
  /** Counted things, for "84 sessions" and "Save this session". */
  noun: { one: string, many: string }
  /** Which views the switcher offers, in order. */
  views: ArchiveView[]
  /** Whether items carry an intensity bin, and so whether the range selector means anything. */
  hasBins: boolean
  /** Shuffled on arrival, or in the collection's own order. */
  defaultShuffled: boolean
  /** What MiniSearch indexes. */
  searchFields: string[]
}

export const COLLECTIONS: Record<CollectionId, CollectionSpec> = {
  archive: {
    id: 'archive',
    path: '/archive',
    title: 'the archive',
    noun: { one: 'clip', many: 'clips' },
    views: ['feed', 'grid', 'galaxy'],
    hasBins: true,
    defaultShuffled: true,
    searchFields: ['name', 'description', 'srcAuthor', 'srcLocation', 'topics', 'keywords'],
  },

  /*
   * The participant session recordings from `x_logs/` in the bucket.
   *
   * No galaxy: it is a spatial layout of the archive's intensity scale, and
   * sessions have no bins to lay out. For the same reason there is no range
   * selector. In their own order rather than shuffled, because a set of 84
   * dated sessions reads as a chronology — shuffling is still one click away.
   */
  sessions: {
    id: 'sessions',
    path: '/experience-logs',
    title: 'the experience logs',
    noun: { one: 'session', many: 'sessions' },
    views: ['feed', 'grid'],
    hasBins: false,
    defaultShuffled: false,
    searchFields: ['name', 'description'],
  },
}

/**
 * True on any page that renders the browser — those have their own players.
 *
 * For the ambient player only, which lives in the layout and asks about the
 * route it is on. Which collection a page SHOWS is declared by the page
 * itself — see useArchiveCollection.
 */
export function isCollectionPath(path: string): boolean {
  return Object.values(COLLECTIONS).some(c => path === c.path || path.startsWith(`${c.path}/`))
}
