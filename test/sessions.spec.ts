import { readdirSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { COLLECTIONS, isCollectionPath } from '../shared/utils/collections'
import { cueAt, cueTitle, parseCues, parseMetrics, SESSION_METRICS, sessionLabel, sessionLength, shapeSession, shapeSessions } from '../shared/utils/sessions'

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

describe('which clip was on screen: cues from filenames.csv', () => {
  // Real shape: subject;timestamp;clip — the subject is the participant.
  const csv = [
    'ali;2025-01-14 12:26:07.99;',
    'ali;2025-01-14 12:26:08.07;Soldiers fighting with swords - 1_1_HAP.mov',
    'ali;2025-01-14 12:26:16.44;19 Minutes of John Wick Linked Comp 105-Untitled Project.mp4_HAP.mov',
    'ali;2025-01-14 12:26:16.90;19 Minutes of John Wick Linked Comp 105-Untitled Project.mp4_HAP.mov',
    'ali;2025-01-14 12:26:22.45;',
    'ali;2025-01-14 12:40:00.00;Past the end of the video_HAP.mov',
  ].join('\n')

  it('turns a headset filename into the archive display name', () => {
    expect(cueTitle('19 Minutes of John Wick Linked Comp 105-Untitled Project.mp4_HAP.mov'))
      .toBe('19 Minutes of John Wick Linked Comp 105-Untitled Project')
    expect(cueTitle('Soldiers fighting with swords - 1_1_HAP.mov')).toBe('Soldiers fighting with swords - 1 1')
  })

  it('aligns rows to the video by its recorded start, and collapses repeats', () => {
    const cues = parseCues(csv, '2025-01-14 12:26:02', 600)
    expect(cues).toEqual([
      { at: 5.99, title: null },
      { at: 6.07, title: 'Soldiers fighting with swords - 1 1' },
      { at: 14.44, title: '19 Minutes of John Wick Linked Comp 105-Untitled Project' },
      { at: 20.45, title: null },
    ])
  })

  it('drops rows from before the video and after it ends', () => {
    // The opening night's headset logged into one file for eight hours; only
    // this recording's stretch belongs to it.
    const early = 'x;2025-01-14 09:00:00.00;An earlier session_HAP.mov\n' + csv
    const cues = parseCues(early, '2025-01-14 12:26:02', 600)
    expect(cues.map(c => c.title)).not.toContain('An earlier session')
    expect(cues.map(c => c.title)).not.toContain('Past the end of the video')
  })

  it('starts from the first row when the recording lost its time of day', () => {
    // "VR-14._mitchel" — the index has a date only.
    expect(parseCues(csv, '2025-01-22', 600)[0]).toEqual({ at: 0, title: null })
  })

  it('never carries the subject column', () => {
    expect(JSON.stringify(parseCues(csv, '2025-01-14 12:26:02', 600))).not.toMatch(/ali/)
  })

  it('looks up the cue in force at any moment, including before the first', () => {
    const cues = parseCues(csv, '2025-01-14 12:26:02', 600)
    expect(cueAt(cues, 0)).toBeNull()
    expect(cueAt(cues, 6.07)).toBe('Soldiers fighting with swords - 1 1')
    expect(cueAt(cues, 10)).toBe('Soldiers fighting with swords - 1 1')
    expect(cueAt(cues, 18)).toBe('19 Minutes of John Wick Linked Comp 105-Untitled Project')
    expect(cueAt(cues, 500)).toBeNull() // after the last gap row
    expect(cueAt([], 10)).toBeNull()
  })

  it('is served parsed, for sessions the index lists, and never as raw CSV', () => {
    const route = code('server/api/experience-logs/[slug]/cues.get.ts')
    expect(route).toMatch(/readSessionCsv\(getRouterParam\(event, 'slug'\) \?\? '', 'filenames'\)/)
    expect(route).toMatch(/return csv \? parseCues\(csv,/)

    const reader = code('server/utils/session-index.ts')
    expect(reader).toMatch(/\.find\(item => item\.slug === slug\)/)
    expect(reader).toMatch(/if \(!entry\) throw createError\(\{ statusCode: 404/)
  })

  it.each(['ArchivePlayer.vue', 'ArchiveModalPlayer.vue'])('%s follows the playhead on play and on seek', (player) => {
    const source = read(`app/components/archive/${player}`)
    expect(source).toMatch(/useSessionCues\(toRef\(props, 'item'\), videoEl\)/)
    expect(source).toMatch(/@seeked="onSeeked"/)
    expect(source.slice(source.indexOf('function onSeeked'))).toMatch(/^function onSeeked\(\): void \{\n\s+void updateCue\(\)/)
    expect(source).toMatch(/void updateCue\(\)/)
    expect(source).toMatch(/<ArchiveSessionCue :title="onScreen" \/>/)
  })
})

describe('the headset graph: readings from met.csv', () => {
  // Real shape: subject;timestamp;attention;interest;engagement;excitement;relaxation;stress
  const csv = [
    'ali;2025-01-14 09:00:00.00;0.5;0.5;0.5;0.5;0.5;0.5', // an earlier session
    'ali;2025-01-14 12:26:10.84;0.44107401371;0.41738200188;0.39310199022;0.20981000364;0.6970589757;0.3836210072',
    'ali;2025-01-14 12:26:20.83;0;0;0;0;0;0', // headset off
    'ali;2025-01-14 12:26:30.84;0.45998600125;0;0.48863101006;0.16379599273;0.69497197866;0.31505998969',
    'ali;2025-01-14 12:40:00.00;0.5;0.5;0.5;0.5;0.5;0.5', // past the end
  ].join('\n')

  it('plots the six metrics in the CSV\'s column order, as two-letter labels', () => {
    expect(SESSION_METRICS.map(m => m.label))
      .toEqual(['Attention', 'Interest', 'Engagement', 'Excitement', 'Relaxation', 'Stress'])
    expect(SESSION_METRICS.map(m => m.short)).toEqual(['AT', 'IN', 'EN', 'EX', 'RE', 'ST'])
  })

  it('aligns readings to the video, and drops rows outside it', () => {
    const { duration, readings } = parseMetrics(csv, '2025-01-14 12:26:02', 600)
    expect(duration).toBe(600)
    expect(readings.map(r => r.at)).toEqual([8.84, 28.84])
    expect(readings[0]!.values).toEqual([0.441, 0.417, 0.393, 0.21, 0.697, 0.384])
  })

  it('reads an exact zero as no signal, so the line breaks instead of diving', () => {
    const { readings } = parseMetrics(csv, '2025-01-14 12:26:02', 600)
    // The all-zero row is gone entirely; a single zero is a gap in one line.
    expect(readings).toHaveLength(2)
    expect(readings[1]!.values[1]).toBeNull()
    expect(readings[1]!.values[0]).toBe(0.46)
  })

  it('never carries the subject column', () => {
    expect(JSON.stringify(parseMetrics(csv, '2025-01-14 12:26:02', 600))).not.toMatch(/ali/)
  })

  it('is served parsed, for sessions the index lists, and never as raw CSV', () => {
    const route = code('server/api/experience-logs/[slug]/metrics.get.ts')
    expect(route).toMatch(/readSessionCsv\(getRouterParam\(event, 'slug'\) \?\? '', 'met'\)/)
    expect(route).toMatch(/parseMetrics\(csv,/)
  })

  it.each(['ArchivePlayer.vue', 'ArchiveModalPlayer.vue'])('%s draws it under the video, for sessions only', (player) => {
    const source = read(`app/components/archive/${player}`)
    expect(source).toMatch(/useSessionMetrics\(toRef\(props, 'item'\)\)/)
    expect(source).toMatch(/<ArchiveSessionGraph\s+v-if="[^"]*session[^"]*"/i)
    // Under the video: after the stage, before the controls.
    const graph = source.indexOf('<ArchiveSessionGraph')
    expect(graph).toBeGreaterThan(source.indexOf('<video'))
    expect(graph).toBeLessThan(source.search(/class="(clip|modal)__controls"/))
  })

  it.each([
    ['ArchivePlayer.vue', 'item.kind !== \'session\''],
    ['ArchiveModalPlayer.vue', '!isSession'],
  ])('%s moves a session\'s seek bar into the graph, keeping the control bar', (player, notSession) => {
    const source = read(`app/components/archive/${player}`)
    // The range input is for clips only; a session seeks on its timeline.
    expect(source).toMatch(new RegExp(`<template v-if="${notSession.replace(/[.!]/g, '\\$&')}">\\s*<label[\\s\\S]*?type="range"[\\s\\S]*?</template>`))
    expect(source).toMatch(/:duration="duration"\s+@seek="seekTo"/)
    // Play, time, mute… still sit in the control bar under the graph.
    const controls = source.slice(source.search(/class="(clip|modal)__controls"/))
    expect(controls).toMatch(/__time/)
    expect(controls).toMatch(/togglePlay/)
  })

  it('makes the timeline a keyboard-operable slider that does not leak arrow keys', () => {
    const graph = read('app/components/archive/ArchiveSessionGraph.vue')
    expect(graph).toMatch(/role="slider"/)
    expect(graph).toMatch(/tabindex="0"/)
    expect(graph).toMatch(/:aria-valuetext="valueText"/)
    for (const key of ['ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End']) {
      expect(graph).toMatch(new RegExp(`${key}:`))
    }
    // The modal takes ArrowLeft/Right on the document as previous/next clip.
    expect(graph.slice(graph.indexOf('function onKeydown'))).toMatch(/event\.stopPropagation\(\)/)
    expect(graph).toMatch(/\.graph__timeline:focus-visible \{/)
  })

  it('stacks the legend in a column at the start of the lines', () => {
    const graph = read('app/components/archive/ArchiveSessionGraph.vue')
    expect(graph).toMatch(/grid-template-columns: auto 1fr;/)
    expect(graph).toMatch(/\.graph__legend \{[^}]*flex-direction: column;/)
    expect(graph.indexOf('<figcaption class="graph__legend">')).toBeLessThan(graph.indexOf('class="graph__timeline"'))
  })

  it('draws with the series tokens, not colours of its own (hard rule 19\'s spirit)', () => {
    const graph = read('app/components/archive/ArchiveSessionGraph.vue')
    expect(graph).toMatch(/var\(--series-\$\{index \+ 1\}\)/)
    expect(graph).not.toMatch(/#[0-9a-f]{3,8}\b/i)
  })
})
