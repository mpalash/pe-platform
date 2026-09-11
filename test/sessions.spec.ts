import { readdirSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { COLLECTIONS, isCollectionPath } from '../shared/utils/collections'
import { sessionLabel, sessionLength, shapeSession, shapeSessions } from '../shared/utils/sessions'

const repoRoot = resolve(import.meta.dirname, '..')
const read = (path: string) => readFileSync(resolve(repoRoot, path), 'utf8')
/** Code only — explaining why something is not used is not using it. */
const code = (path: string) => read(path).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

function walk(dir: string): string[] {
  return readdirSync(resolve(repoRoot, dir)).flatMap((entry) => {
    const rel = `${dir}/${entry}`
    return statSync(resolve(repoRoot, rel)).isDirectory() ? walk(rel) : [rel]
  })
}

/**
 * /experience-logs is the archive browser over a second collection. These pin
 * the differences between the two, which are the whole of what the new page
 * adds — and the one privacy decision it makes.
 */
describe('the two collections', () => {
  it('offers the galaxy on the archive and not on the experience logs', () => {
    expect(COLLECTIONS.archive.views).toContain('galaxy')
    expect(COLLECTIONS.sessions.views).toEqual(['feed', 'grid'])
  })

  it('shows the intensity selector only where items have bins', () => {
    expect(COLLECTIONS.archive.hasBins).toBe(true)
    expect(COLLECTIONS.sessions.hasBins).toBe(false)
  })

  it('keeps the archive in its original namespace', () => {
    // Every store key is prefixed by this. Anything other than `archive` would
    // quietly discard every visitor's saved clips and view preference.
    expect(COLLECTIONS.archive.id).toBe('archive')
    expect(read('app/composables/useArchive.ts')).toMatch(/`pe:\$\{ns\}:bookmarks`/)
  })

  it('gives the two collections separate namespaces', () => {
    expect(COLLECTIONS.archive.id).not.toBe(COLLECTIONS.sessions.id)
  })

  /** Each page names its collection; nothing maps paths to collections. */
  it.each([
    ['app/pages/archive.vue', 'archive'],
    ['app/pages/experience-logs.vue', 'sessions'],
  ])('%s declares the %s collection itself', (page, id) => {
    expect(code(page)).toMatch(new RegExp(`provideArchiveCollection\\('${id}'\\)`))
  })

  it('never reads the collection off the route', () => {
    const lookup = code('app/composables/useArchiveCollection.ts')
    expect(lookup).not.toMatch(/useRoute|route\.path/)
    expect(lookup).toMatch(/inject\(ARCHIVE_COLLECTION/)
  })

  it('throws outside a page that provides one, rather than defaulting to the archive', () => {
    // A silent default would let a page show the wrong collection unreported.
    const lookup = code('app/composables/useArchiveCollection.ts')
    expect(lookup).toMatch(/if \(!spec\) \{\s*throw new Error/)
  })

  it('treats a longer path as a different page', () => {
    expect(isCollectionPath('/experience-logs/')).toBe(true)
    expect(isCollectionPath('/experience-logs-and-more')).toBe(false)
  })

  it('keeps the ambient player off both pages', () => {
    // Hard rule 16, extended: both pages have their own players and advisory.
    expect(isCollectionPath('/archive')).toBe(true)
    expect(isCollectionPath('/experience-logs')).toBe(true)
    expect(isCollectionPath('/about')).toBe(false)
    expect(read('app/composables/useAmbientVideo.ts')).toMatch(/!isCollectionPath\(route\.path\)/)
  })

  it('never lets a stored view outlive the collection that offers it', () => {
    // A persisted 'galaxy' reaching the experience logs would mount no view
    // at all — a blank page with no error.
    const view = read('app/composables/useArchiveView.ts')
    expect(view).toMatch(/spec\.views\.includes\(stored\.value\) \? stored\.value : spec\.views\[0\]/)
  })
})

describe('session labels', () => {
  it('reads the recorded time as written, never through Date', () => {
    // Venue-local wall-clock time with no zone (hard rule 10). `new Date()`
    // would shift it by the reader's distance from the venue.
    expect(sessionLabel('2025-01-14 12:26:02')).toBe('14 January 2025, 12:26')
    expect(sessionLabel('2024-12-18 01:46:44')).toBe('18 December 2024, 01:46')
    expect(code('shared/utils/sessions.ts')).not.toMatch(/new Date\(/)
  })

  it('falls back to the date alone when the source lost its time', () => {
    // "25.01.22-Participant VR-14._mitchel.mov" — the index carries a date only.
    expect(sessionLabel('2025-01-22')).toBe('22 January 2025')
  })

  it('never throws on a missing date', () => {
    expect(sessionLabel(null)).toBe('Undated session')
    expect(sessionLabel('nonsense')).toBe('Undated session')
  })

  it('rounds length to whole minutes', () => {
    expect(sessionLength(3010.77)).toBe('50 minutes')
    expect(sessionLength(63.7)).toBe('1 minute')
    expect(sessionLength(10)).toBe('1 minute')
  })
})

describe('what a session carries to the browser', () => {
  // The real shape of an x_logs/index.json entry, participant name included.
  const entry = {
    slug: '25-01-09-participant-vr-20-43-32-vincenzo-opening-night',
    source: 'Experience Log/25.01.09-Participant VR-20.43.32_Vincenzo_opening night.mov',
    recorded: '2025-01-09 20:43:32',
    duration: 3298.5,
    met: 'x_logs/25-01-09-participant-vr-20-43-32-vincenzo-opening-night/met.csv',
    met_source: 'Experience Log/PurgatoryEDIT_2025-01-09_subjectID_Vincenzo_opening night_met.csv',
    filenames: 'x_logs/25-01-09-participant-vr-20-43-32-vincenzo-opening-night/filenames.csv',
  }

  it('is labelled by when it was recorded', () => {
    const item = shapeSession(entry)
    expect(item.name).toBe('9 January 2025, 20:43')
    expect(item.kind).toBe('session')
  })

  it('shows no name, source filename or headset-data path anywhere except the slug', () => {
    // The slug is the folder in the bucket, and so is part of the media URL
    // either way. Everything the browser DISPLAYS must be free of the name.
    const { id, filename, ...shown } = shapeSession(entry)
    expect(id).toBe(entry.slug)
    expect(filename).toBe(entry.slug)
    expect(JSON.stringify(shown)).not.toMatch(/vincenzo|\.mov|\.csv|subjectID/i)
  })

  it('is shaped on the server, so the names never reach a browser at all', () => {
    const route = read('server/api/experience-logs.get.ts')
    expect(route).toMatch(/return shapeSessions\(/)
    expect(read('app/composables/useArchive.ts')).toMatch(/\$fetch<ArchiveItem\[\]>\('\/api\/experience-logs'\)/)
  })

  it('sorts into recording order, keeping an undated entry', () => {
    const sorted = shapeSessions([
      { slug: 'b', recorded: '2025-01-14 12:26:02', duration: 60 },
      { slug: 'a', recorded: '2024-12-18 01:46:44', duration: 60 },
      { slug: 'x', recorded: null, duration: 60 },
    ])
    expect(sorted.map(i => i.id)).toEqual(['x', 'a', 'b'])
  })
})

describe('hls.js', () => {
  it('is loaded on demand, from the playback seam only', () => {
    // A static import anywhere would put it in the bundle of every page,
    // the archive included, which never plays a stream.
    const seam = read('app/composables/usePlaybackSource.ts')
    expect(seam).toMatch(/await import\('hls\.js\/light'\)/)

    const staticImports = walk('app')
      // Declaration files are types only — nothing in one reaches a bundle.
      .filter(f => /\.(ts|vue)$/.test(f) && !f.endsWith('.d.ts'))
      .filter(f => /^\s*import\s[^(]*from\s+['"]hls\.js/m.test(read(f)))
    expect(staticImports).toEqual([])
  })

  it('is never bound as <video :src>, which plays HLS only in Safari', () => {
    for (const player of ['ArchivePlayer.vue', 'ArchiveModalPlayer.vue']) {
      const source = read(`app/components/archive/${player}`)
      expect(source, player).not.toMatch(/:src="src"/)
      expect(source, player).toMatch(/useVideoSource\(videoEl,/)
    }
  })

  it('discards a connection superseded while hls.js was loading', () => {
    // Stepping quickly through the modal must never leave the previous
    // stream attached to the element.
    const seam = read('app/composables/usePlaybackSource.ts')
    expect(seam).toMatch(/if \(!isCurrent\(\)\) return \(\) => \{\}/)
    expect(seam).toMatch(/if \(video\.src !== mine\) return/)
  })
})
