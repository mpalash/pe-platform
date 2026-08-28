/**
 * Picks the pool of clips the floating ambient player draws from.
 *
 *   pnpm archive:pool
 *
 * Same reasoning as build-sources.ts: the archive dataset is 18MB, and no page
 * outside /archive has any business loading it. A pool of a few hundred clips
 * is a handful of kilobytes and is indistinguishable from "random from the
 * archive" at the scale anyone actually watches — nobody sees the 201st clip.
 *
 * The sample is SEEDED, so rebuilding produces the same pool. The artefact is
 * committed, and an unseeded sample would rewrite it on every build and put a
 * meaningless 24KB diff in every commit that touched the frontend.
 *
 * Re-seed by changing POOL_SEED, which is the deliberate way to reshuffle.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { shapeEdit } from '../shared/utils/archive'
import type { RawEdit } from '../shared/utils/archive'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const POOL_SIZE = 200
const POOL_SEED = 20260828

/**
 * Which bins may appear. Empty means the whole scale, Peace-05 through War-10,
 * which is what "random from the archive" means literally.
 *
 * Worth knowing before changing it: /archive puts an advisory gate in front of
 * this material, and the ambient player does not — it starts on load. Narrowing
 * this to the peaceful end is a one-line change here if that trade is ever
 * judged the wrong way round.
 */
const ALLOWED_BINS: readonly string[] = []

/** Mulberry32 — small, seeded, and good enough to shuffle a list once. */
function random(seed: number): () => number {
  let a = seed >>> 0

  return () => {
    a = (a + 0x6D2B79F5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const records = JSON.parse(
  readFileSync(resolve(repoRoot, 'public/data/edits.json'), 'utf8'),
) as RawEdit[]

const eligible = records
  .map(record => shapeEdit(record))
  // A clip with no filename has no media, and the player would show a black
  // box rather than skip it.
  .filter(item => Boolean(item.filename))
  .filter(item => ALLOWED_BINS.length === 0 || (item.bin ? ALLOWED_BINS.includes(item.bin) : false))

// Fisher-Yates against the seeded generator, then take the first POOL_SIZE.
const next = random(POOL_SEED)
const shuffled = [...eligible]

for (let i = shuffled.length - 1; i > 0; i--) {
  const j = Math.floor(next() * (i + 1))
  ;[shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!]
}

const pool = shuffled.slice(0, POOL_SIZE).map(item => ({
  id: item.id,
  filename: item.filename,
  name: item.name,
  bin: item.bin ?? null,
}))

writeFileSync(
  resolve(repoRoot, 'server/assets/ambient-pool.json'),
  `${JSON.stringify(pool, null, 0)}\n`,
)

const bins = new Set(pool.map(item => item.bin).filter(Boolean))

console.log(`\n✓ ${pool.length} clips sampled from ${eligible.length.toLocaleString()} eligible`)
console.log(`  ${bins.size} distinct bins represented`)
console.log(`  → server/assets/ambient-pool.json\n`)
