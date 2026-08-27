/**
 * The distinct sources every clip in the archive was excerpted from.
 *
 * Reads the list built by `pnpm archive:sources` out of Nitro server storage.
 * Deriving it at build time rather than here is the point: the archive dataset
 * is 18MB and yields about 1,300 sources, and parsing 18MB per request to
 * render a list of names would make the least interactive page on the site the
 * most expensive one.
 *
 * PUBLIC — the archive is public (hard rule 4), and so is its bibliography.
 */
import type { ArchiveSource } from '~~/shared/utils/archive'

export default defineCachedEventHandler(async (): Promise<ArchiveSource[]> => {
  const sources = await useStorage('assets:server').getItem<ArchiveSource[]>('sources.json')

  if (!sources) {
    // A missing artefact is a build that skipped a step, not a runtime fault.
    // Say which step, because "empty source index" is otherwise a silent page.
    throw createError({
      statusCode: 500,
      statusMessage: 'server/assets/sources.json is missing. Run `pnpm archive:sources`.',
    })
  }

  return sources
}, {
  // The artefact changes only when the archive is re-exported, which is a
  // deploy rather than a runtime event.
  maxAge: 60 * 60,
  name: 'archive-sources',
  getKey: () => 'sources',
})
