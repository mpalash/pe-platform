/**
 * Invariants of the galaxy view.
 *
 * These are not tests of behaviour so much as guards on a handful of constants
 * whose relationships are load-bearing and non-obvious. Each one here cost real
 * time to find, and every one of them fails silently — the galaxy renders
 * beautifully and does the wrong thing.
 *
 * Source text, not a mounted component: three.js needs a WebGL context, and the
 * facts being checked are relationships between literals rather than anything
 * that happens at runtime.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const repoRoot = resolve(import.meta.dirname, '..')

const galaxySource = readFileSync(
  resolve(repoRoot, 'app/components/archive/ArchiveGalaxy.vue'),
  'utf8',
)

/** Comments explain these constants at length; matching prose is not a test. */
function code(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
}

function number(name: string): number {
  const match = code(galaxySource).match(new RegExp(`${name}\\s*[=:]\\s*([\\d.]+)`))
  expect(match, `${name} not found in ArchiveGalaxy.vue`).toBeTruthy()
  return Number(match![1])
}

describe('galaxy camera', () => {
  /**
   * The bug that made every thumbnail invisible while the loading code was
   * entirely correct.
   *
   * The vertex shader fades a thumbnail in only within `uThumbDist` of the
   * camera. With the camera resting outside the disc, the nearest tile is
   * further away than any reasonable depth setting, `near` evaluates to 0 for
   * every tile on screen, and the textures — loaded, decoded, in the atlas —
   * are drawn at zero opacity.
   */
  it('rests inside the galaxy, not outside it', () => {
    const rest = number('CAM_REST_DISTANCE')
    const radius = number('radius')

    expect(rest).toBeLessThan(radius)
  })

  /** Some tile must be reachable by the default depth, or nothing ever shows. */
  it('rests close enough that the default depth can reach tiles', () => {
    const rest = number('CAM_REST_DISTANCE')
    const depth = Number(
      readFileSync(resolve(repoRoot, 'app/composables/useGalaxyControls.ts'), 'utf8')
        .match(/depthRange.*?=>\s*(\d+)/)![1],
    )

    // The camera sits `rest` from the centre of a disc that extends well past
    // it, so tiles surround it; the depth only has to be a workable fraction of
    // how far out it is, not larger than it.
    expect(depth).toBeGreaterThan(rest * 0.25)
  })

  it('starts the fly-in from outside, so there is a fly-in at all', () => {
    expect(number('CAM_INTRO_DISTANCE')).toBeGreaterThan(number('CAM_REST_DISTANCE'))
  })
})

describe('thumbnail slot thresholds', () => {
  /**
   * Acquire high, release low. Inverted or equal, a tile tumbling across the
   * line loads, drops and reloads on every scan, spending a request each time.
   */
  it('releases on a looser facing threshold than it acquires', () => {
    expect(number('FACING_KEEP')).toBeLessThan(number('FACING_TAKE'))
  })

  it('keeps facing thresholds within the range of a dot product', () => {
    expect(number('FACING_TAKE')).toBeLessThanOrEqual(1)
    expect(number('FACING_KEEP')).toBeGreaterThan(0)
  })

  /** Same hysteresis for distance: released further out than acquired. */
  it('releases on a wider radius than it acquires', () => {
    expect(number('KEEP_MARGIN')).toBeGreaterThan(1)
  })
})

describe('thumbnail atlas', () => {
  /**
   * Square cells against 16:9 sources centre-crop every thumbnail to a third
   * of its width — which looks like a bad crop rather than like a bug.
   */
  it('uses cells matching the 16:9 source thumbnails', () => {
    const ratio = number('ATLAS_CELL_W') / number('ATLAS_CELL_H')

    expect(ratio).toBeCloseTo(16 / 9, 1)
  })

  it('fits its cells into the atlas without remainder mattering', () => {
    const size = number('ATLAS_SIZE_PX')

    expect(Math.floor(size / number('ATLAS_CELL_W'))).toBeGreaterThan(1)
    expect(Math.floor(size / number('ATLAS_CELL_H'))).toBeGreaterThan(1)
  })
})

describe('galaxy controls', () => {
  /**
   * The toolbar renders these now. A local ref here would silently shadow the
   * shared state and leave the toolbar adjusting nothing.
   */
  it('reads its display controls from the shared composable', () => {
    expect(code(galaxySource)).toContain('useGalaxyControls()')
    expect(code(galaxySource)).not.toMatch(/const\s+paused\s*=\s*ref\(/)
    expect(code(galaxySource)).not.toMatch(/const\s+depthRange\s*=\s*ref\(/)
  })

  /** A drag must not flip the user's own pause toggle, or unfreeze on release. */
  it('freezes for a panel drag without touching the pause control', () => {
    expect(code(galaxySource)).toMatch(/frozen\s*=\s*computed\(\(\)\s*=>\s*paused\.value\s*\|\|/)
  })
})
