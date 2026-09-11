import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  BINS,
  assignStableIds,
  binsInRange,
  collectSources,
  shapeEdit,
  shuffle,
  toDisplayName,
  toTags,
} from '../shared/utils/archive'
import type { ArchiveItem, RawEdit } from '../shared/utils/archive'

const repoRoot = resolve(import.meta.dirname, '..')

function raw(overrides: Partial<RawEdit> = {}): RawEdit {
  return {
    uid: 'ABC123',
    filename: 'Some_Clip Name Comp 01.mp4',
    binCategory: 'War-03',
    keywords: 'riot, police',
    srcName: 'A source',
    topics: 'Protest',
    description: 'A description',
    srcAuthor: 'An author',
    srcLocation: 'Somewhere',
    srcType: 'Documentary',
    srcURL: 'https://example.com/x',
    ...overrides,
  }
}

describe('tag parsing', () => {
  // The archive's own conventions — hash- and comma-separated, inconsistently.
  it.each([
    ['riot, police', ['riot', 'police']],
    // ' #' becomes ', ' before bare '#' is stripped, so hash-separated tags split.
    ['#war #protest', ['war', 'protest']],
    ['war #protest', ['war', 'protest']],
    ['', []],
    [null, []],
  ])('%s → %s', (input, expected) => {
    expect(toTags(input)).toEqual(expected)
  })
})

describe('display names', () => {
  it('drops the extension and unpicks underscores', () => {
    expect(toDisplayName('Some_Clip Name.mp4')).toBe('Some Clip Name')
  })
})

describe('shaping', () => {
  it('keeps the filename raw', () => {
    // usePlaybackSource is the only thing allowed to interpret it (hard rule 5).
    const item = shapeEdit(raw())
    expect(item.filename).toBe('Some_Clip Name Comp 01.mp4')
  })

  it('maps binCategory to bin and splits the tag fields', () => {
    const item = shapeEdit(raw())
    expect(item.bin).toBe('War-03')
    expect(item.keywords).toEqual(['riot', 'police'])
    expect(item.topics).toEqual(['Protest'])
  })
})

describe('stable ids', () => {
  /**
   * The real export carries 167 records with an EMPTY uid and three reused
   * ones. MiniSearch throws on a duplicate id, and that took down the entire
   * feed rather than the affected records — so this is not a hypothetical.
   */
  it('gives every item a unique id even when uids are empty or reused', () => {
    const items = [
      shapeEdit(raw({ uid: 'A', filename: 'one.mp4' })),
      shapeEdit(raw({ uid: '', filename: 'two.mp4' })),
      shapeEdit(raw({ uid: '', filename: 'three.mp4' })),
      shapeEdit(raw({ uid: 'A', filename: 'four.mp4' })),
    ]

    const fixed = assignStableIds(items)
    const ids = fixed.map(item => item.id)

    expect(new Set(ids).size).toBe(4)
    expect(ids[0]).toBe('A')
  })

  it('keeps no item back', () => {
    const items = Array.from({ length: 20 }, (_, index) =>
      shapeEdit(raw({ uid: '', filename: `clip-${index}.mp4` })))

    expect(assignStableIds(items)).toHaveLength(20)
  })

  it('derives ids from the filename, so they survive a re-export', () => {
    const once = assignStableIds([shapeEdit(raw({ uid: '', filename: 'a clip.mp4' }))])
    const twice = assignStableIds([shapeEdit(raw({ uid: '', filename: 'a clip.mp4' }))])

    expect(once[0]!.id).toBe(twice[0]!.id)
  })

  it('distinguishes two items that share a filename', () => {
    const items = [
      shapeEdit(raw({ uid: '', filename: 'same.mp4' })),
      shapeEdit(raw({ uid: '', filename: 'same.mp4' })),
    ]

    const ids = assignStableIds(items).map(item => item.id)
    expect(new Set(ids).size).toBe(2)
  })
})

describe('sources', () => {
  it('collects each source once, in first-seen order', () => {
    const sources = collectSources([
      raw({ srcName: 'B' }),
      raw({ srcName: 'A' }),
      raw({ srcName: 'B' }),
    ])

    expect(sources.map(source => source.srcName)).toEqual(['B', 'A'])
  })
})

describe('bin ranges', () => {
  it('has fifteen bins running Peace-05 to War-10', () => {
    expect(BINS).toHaveLength(15)
    expect(BINS[0]).toBe('Peace-05')
    expect(BINS.at(-1)).toBe('War-10')
  })

  it('is inclusive at both ends', () => {
    expect(binsInRange([0, 0])).toEqual(new Set(['Peace-05']))
    expect(binsInRange([9, 14]).size).toBe(6)
  })

  it('treats null as "no filter", not "nothing matches"', () => {
    // Conflating the two is how a filter silently empties a feed.
    expect(binsInRange(null).size).toBe(0)
  })
})

describe('shuffle', () => {
  it('keeps every element', () => {
    const input = Array.from({ length: 50 }, (_, index) => index)
    expect([...shuffle(input)].sort((a, b) => a - b)).toEqual(input)
  })

  it('does not mutate its input', () => {
    const input = [1, 2, 3, 4, 5]
    shuffle(input)
    expect(input).toEqual([1, 2, 3, 4, 5])
  })
})

describe('the playback seam', () => {
  const source = readFileSync(resolve(repoRoot, 'app/composables/usePlaybackSource.ts'), 'utf8')

  it('is the only place a container format appears', () => {
    // Hard rule 5. A `.mp4` literal anywhere else is a bug.
    const offenders: string[] = []
    // Everything that plays, lists or shapes media — including the modal and
    // the grid, which this list used to miss, and everything the experience
    // logs added. Sessions are HLS, so `.m3u8` is exactly as forbidden here as
    // `.mp4`: it belongs in usePlaybackSource and nowhere else.
    const searched = [
      'app/components/archive/ArchivePlayer.vue',
      'app/components/archive/ArchiveFeed.vue',
      'app/components/archive/ArchiveGrid.vue',
      'app/components/archive/ArchiveModalPlayer.vue',
      'app/components/archive/ArchiveToolbar.vue',
      'app/components/archive/ArchiveBrowser.vue',
      'app/pages/archive.vue',
      'app/pages/experience-logs.vue',
      'app/composables/useArchive.ts',
      'app/composables/useArchiveCollection.ts',
      'shared/utils/collections.ts',
      'shared/utils/sessions.ts',
      'server/api/experience-logs.get.ts',
    ]

    for (const file of searched) {
      const contents = readFileSync(resolve(repoRoot, file), 'utf8')
      // Strip comments — discussing the format is fine; depending on it is not.
      const code = contents
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '')
        .replace(/<!--[\s\S]*?-->/g, '')

      if (/\.mp4|\.m3u8|\.webm/.test(code)) offenders.push(file)
    }

    expect(offenders).toEqual([])
  })

  it('refuses to build a URL when no media base is configured', () => {
    expect(source).toMatch(/if \(!media\) return empty/)
  })

  it('requires an explicit opt-in before falling back to the S3 origin', () => {
    // Hard rule 3: S3 egress is billed per view.
    expect(source).toMatch(/mediaAllowOriginFallback/)
    expect(source).toMatch(/if \(!origin \|\| !allowFallback\) return null/)
  })
})

describe('shaping the real export', () => {
  /**
   * Runs against the actual data file rather than a fixture. It is the only way
   * to catch the problems that mattered here — the empty uids were invisible
   * against any fixture anyone would have thought to write.
   */
  const records = JSON.parse(
    readFileSync(resolve(repoRoot, 'public/data/edits.json'), 'utf8'),
  ) as RawEdit[]

  const shaped: ArchiveItem[] = assignStableIds(records.map(shapeEdit))

  it('has more than 30,000 clips', () => {
    expect(shaped.length).toBeGreaterThan(30_000)
  })

  it('produces no duplicate ids, which is what MiniSearch requires', () => {
    expect(new Set(shaped.map(item => item.id)).size).toBe(shaped.length)
  })

  it('leaves no item without an id', () => {
    expect(shaped.filter(item => !item.id).length).toBe(0)
  })

  /**
   * These two document the export's real shape rather than asserting a tidier
   * one. Both are findings, not failures — and both are inherited from pe-vue,
   * which filtered the same way against the same data.
   */
  it('records that a large minority of clips carry NO bin', () => {
    const unbinned = shaped.filter(item => !item.bin).length

    // ~41% of the archive. Any bin filter necessarily excludes all of them,
    // which is why the selector's "no range" state must mean "no filter"
    // rather than "match nothing".
    expect(unbinned).toBeGreaterThan(10_000)
    expect(unbinned / shaped.length).toBeLessThan(0.5)
  })

  it('records the off-scale bin values the selector cannot reach', () => {
    const known = new Set<string>(BINS)
    const offScale = new Set(
      shaped.map(item => item.bin).filter(bin => bin && !known.has(bin)),
    )

    // `INT` and `Overlay/ Misc` are not points on the Peace–War intensity axis,
    // so no contiguous range over BINS can select them. Roughly 134 clips are
    // reachable by search but never by the intensity filter. Worth fixing in
    // the data, not by widening the scale.
    expect([...offScale].sort()).toEqual(['INT', 'Overlay/ Misc'])
  })
})

describe('source index artefact', () => {
  /**
   * The source index is derived at build time into server/assets/sources.json
   * and committed, so that the page can render on the server without shipping
   * the 18MB archive to the browser. If it drifts from the dataset, the page
   * quietly serves a stale bibliography — which is the one thing an
   * attributions list must not do.
   */
  it('matches what collectSources produces from the dataset', () => {
    const records = JSON.parse(
      readFileSync(resolve(repoRoot, 'public/data/edits.json'), 'utf8'),
    ) as RawEdit[]

    const built = JSON.parse(
      readFileSync(resolve(repoRoot, 'server/assets/sources.json'), 'utf8'),
    ) as Array<{ srcName: string }>

    expect(built).toHaveLength(collectSources(records).length)
  })

  it('is sorted alphabetically, so it can be used as an index', () => {
    const built = JSON.parse(
      readFileSync(resolve(repoRoot, 'server/assets/sources.json'), 'utf8'),
    ) as Array<{ srcName: string }>

    const sorted = [...built].sort((a, b) =>
      a.srcName.localeCompare(b.srcName, 'en', { sensitivity: 'base' }),
    )

    expect(built.map(s => s.srcName)).toEqual(sorted.map(s => s.srcName))
  })
})
