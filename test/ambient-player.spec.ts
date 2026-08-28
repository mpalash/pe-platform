/**
 * The floating ambient player, and the build artefacts it depends on.
 *
 * Source-level assertions: the component needs a DOM and a media element, and
 * what is being guarded here is wiring rather than rendering — a handler that
 * quietly stops being attached is the failure mode in every case below.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const repoRoot = resolve(import.meta.dirname, '..')

function read(path: string): string {
  return readFileSync(resolve(repoRoot, path), 'utf8')
}

function code(source: string): string {
  return source
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
}

const player = code(read('app/components/AmbientVideo.vue'))

describe('playback continues', () => {
  /**
   * `ended` never fires for a source that 404s or fails to decode, so without
   * an error handler one bad clip stalls the player permanently — a black
   * frame that only a reload clears.
   */
  it('skips a clip that fails to load', () => {
    expect(player).toContain('@error="onError"')
  })

  it('advances when a clip finishes', () => {
    expect(player).toContain('@ended="onEnded"')
  })

  /**
   * The player survives ordinary navigation by staying mounted in the layout.
   * It does NOT survive routing through /archive, where it is deliberately
   * absent — that unmounts it, and without a remembered position the return
   * trip starts a different clip from zero.
   */
  it('resumes the remembered clip after being unmounted', () => {
    expect(player).toMatch(/ambient\.resume\.value/)
    expect(player).toMatch(/pool\.value\.find\(item => item\.id === previous\.id\)/)
  })

  it('records its position as it plays', () => {
    expect(player).toContain('@timeupdate="onTimeUpdate"')
  })
})

describe('progress indicator', () => {
  it('is driven by the real duration', () => {
    expect(player).toMatch(/progress\.value = el\.currentTime \/ el\.duration/)
  })

  /** A zero or NaN duration would divide into Infinity and stretch the bar. */
  it('ignores a duration it cannot use', () => {
    expect(player).toMatch(/Number\.isFinite\(el\.duration\)/)
    expect(player).toMatch(/el\.duration <= 0/)
  })
})

describe('artefact routes are not cached in development', () => {
  /**
   * This one bit for real. `defineCachedEventHandler` persists to
   * `.nuxt/cache/nitro/handlers/` ON DISK and survives a dev-server restart.
   * Both routes serve build artefacts, so regenerating an artefact left the
   * cache holding the previous one for an hour of wall-clock time that no
   * restart reset — the ambient pool went on serving war clips after being
   * rebuilt as peace-only, and nothing anywhere reported a problem.
   */
  for (const route of ['ambient-pool', 'sources']) {
    it(`${route} bypasses its cache in dev`, () => {
      const source = code(read(`server/api/archive/${route}.get.ts`))

      expect(source).toMatch(/shouldBypassCache:\s*\(\)\s*=>\s*import\.meta\.dev/)
    })
  }
})
