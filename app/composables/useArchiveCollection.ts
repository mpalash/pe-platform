import type { InjectionKey } from 'vue'
import type { CollectionId, CollectionSpec } from '~~/shared/utils/collections'

/**
 * Which collection the current page is browsing — the archive, or the
 * experience logs.
 *
 * ── Declared by the page ──────────────────────────────────────────────────
 *
 * Each page says which collection it is, with `provideArchiveCollection`, and
 * everything beneath it injects the answer. It could be derived from the
 * route instead — Nuxt gives every component its own page's route, so that
 * would work — but a page that names its collection is one fewer thing to
 * reason about than a path-to-collection mapping, and the mapping is exactly
 * the kind of thing that drifts when a route is renamed.
 *
 * ── And no fallback ───────────────────────────────────────────────────────
 *
 * Asking outside a page that provides one throws. A silent default to the
 * archive would mean a page could show the wrong collection with nothing
 * anywhere reporting it.
 */
const ARCHIVE_COLLECTION: InjectionKey<CollectionSpec> = Symbol('archive-collection')

/** Called once by a page that renders the archive browser. */
export function provideArchiveCollection(id: CollectionId): CollectionSpec {
  const spec = COLLECTIONS[id]
  provide(ARCHIVE_COLLECTION, spec)
  return spec
}

export function useArchiveCollection(): CollectionSpec {
  const spec = inject(ARCHIVE_COLLECTION, null)
  if (!spec) {
    throw new Error(
      'useArchiveCollection() was called outside a page that provides a collection. '
      + 'Call provideArchiveCollection() in the page that renders <ArchiveBrowser />.',
    )
  }
  return spec
}
