/**
 * Archive metadata shaping. Ported from pe-vue's `src/data/edits.js`.
 *
 * Pure and framework-free so the tests can import it directly. Deliberately
 * builds NO urls — that is `usePlaybackSource`'s job, and keeping filenames raw
 * here is what stops a container format leaking into the data layer
 * (hard rule 5).
 */

/** A record exactly as it appears in `public/data/edits.json`. */
export interface RawEdit {
  uid: string
  filename: string
  binCategory: string
  keywords: string
  srcName: string
  topics: string
  description: string
  srcAuthor: string
  srcLocation: string
  srcType: string
  srcURL: string
}

export interface ArchiveItem {
  id: string
  /** Raw filename from the archive. Only usePlaybackSource may interpret it. */
  filename: string
  name: string
  srcName: string
  srcAuthor: string
  srcLocation: string
  srcType: string
  srcURL: string
  bin: string
  topics: string[]
  keywords: string[]
  description: string
}

export interface ArchiveSource {
  srcName: string
  srcAuthor: string
  srcLocation: string
  srcURL: string
}

/**
 * The intensity scale. Order is meaningful — the selector picks a contiguous
 * range across it, so Peace-05 → War-10 reads as one axis from calm to extreme.
 */
export const BINS = [
  'Peace-05', 'Peace-04', 'Peace-03', 'Peace-02', 'Peace-01',
  'War-01', 'War-02', 'War-03', 'War-04', 'War-05',
  'War-06', 'War-07', 'War-08', 'War-09', 'War-10',
] as const

export type Bin = typeof BINS[number]

/**
 * Topics and keywords arrive as one string, variously comma- and
 * hash-separated. Ported verbatim in behaviour — the archive's own conventions,
 * not something to tidy.
 */
export function toTags(value: string | null | undefined): string[] {
  if (!value) return []

  return value
    .replaceAll(' #', ', ')
    .replaceAll('#', '')
    .split(/,\s+/)
    .map(tag => tag.trim())
    .filter(Boolean)
}

/** Filename → display name: drop the extension, underscores become spaces. */
export function toDisplayName(filename: string): string {
  return filename.replaceAll('.mp4', '').replaceAll('_', ' ')
}

export function shapeEdit(raw: RawEdit): ArchiveItem {
  return {
    id: raw.uid,
    filename: raw.filename,
    name: toDisplayName(raw.filename),
    srcName: raw.srcName,
    srcAuthor: raw.srcAuthor,
    srcLocation: raw.srcLocation,
    srcType: raw.srcType,
    srcURL: raw.srcURL,
    bin: raw.binCategory,
    topics: toTags(raw.topics),
    keywords: toTags(raw.keywords),
    description: raw.description,
  }
}

/**
 * Guarantees every item has a unique id.
 *
 * The archive export is not clean: 167 records carry an EMPTY `uid`, and three
 * more reuse an id that belongs to a different clip. MiniSearch throws on a
 * duplicate id, which took the whole feed down rather than the 169 affected
 * records — so this repairs rather than trusts.
 *
 * Repair, not drop: those clips are real and the ids are just missing. A
 * filename-derived id is stable across regenerations of the export in a way an
 * array index would not be.
 */
export function assignStableIds(items: ArchiveItem[]): ArchiveItem[] {
  const used = new Set<string>()

  return items.map((item) => {
    const candidate = item.id?.trim()

    if (candidate && !used.has(candidate)) {
      used.add(candidate)
      return item
    }

    // Derived from the filename, which is the clip's real identity.
    let derived = `x-${slugifyId(item.filename)}`
    let suffix = 2
    while (used.has(derived)) derived = `x-${slugifyId(item.filename)}-${suffix++}`

    used.add(derived)
    return { ...item, id: derived }
  })
}

function slugifyId(value: string): string {
  return value
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80)
}

/** Distinct sources, in first-seen order. Drives the source index. */
export function collectSources(records: RawEdit[]): ArchiveSource[] {
  const seen = new Set<string>()
  const sources: ArchiveSource[] = []

  for (const record of records) {
    if (!record.srcName || seen.has(record.srcName)) continue
    seen.add(record.srcName)
    sources.push({
      srcName: record.srcName,
      srcAuthor: record.srcAuthor,
      srcLocation: record.srcLocation,
      srcURL: record.srcURL,
    })
  }

  return sources
}

/**
 * Fisher–Yates. Replaces lodash's `shuffle` — one function is not worth a
 * dependency, and this one is four lines.
 */
export function shuffle<T>(items: readonly T[]): T[] {
  const result = [...items]

  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[result[i], result[j]] = [result[j]!, result[i]!]
  }

  return result
}

/**
 * Bins within an inclusive index range of BINS.
 *
 * Returns an empty set for a null range, which callers read as "no bin filter"
 * rather than "nothing matches" — the distinction matters, and conflating them
 * is how a filter silently empties a feed.
 */
export function binsInRange(range: readonly [number, number] | null): Set<string> {
  if (!range) return new Set()

  const [start, end] = range
  return new Set(BINS.slice(start, end + 1))
}
