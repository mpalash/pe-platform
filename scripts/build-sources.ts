/**
 * Derives the source index from the archive dataset.
 *
 *   pnpm archive:sources
 *
 * Why a build step rather than a server route or a client fetch:
 *
 * The archive dataset is 18MB and yields about 1,300 distinct sources. The
 * source index needs the 1,300, not the 18MB — shipping the whole file to
 * render a list of names would make the least interactive page on the site the
 * most expensive one. Deriving it once, at build time, leaves a file small
 * enough to render on the server and be indexed, which for an attributions
 * list is the entire point: attribution nobody can find is not attribution.
 *
 * The output is committed. It is derived, but it is derived from another
 * committed build artefact that only changes when the archive is re-exported,
 * and committing it is what lets `pnpm dev` work without a build step first.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { collectSources } from '../shared/utils/archive'
import type { RawEdit } from '../shared/utils/archive'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const input = resolve(repoRoot, 'public/data/edits.json')
/*
 * `server/assets/`, not `public/`. Nitro mounts that directory as server
 * storage, which is readable identically in development and in a build — the
 * public directory is not: it is served by Vite in dev and from `.output/public`
 * in a build, and `$fetch('/data/...')` 404s server-side in the first. Putting
 * it here is what lets the page render on the server at all.
 */
const output = resolve(repoRoot, 'server/assets/sources.json')

const records = JSON.parse(readFileSync(input, 'utf8')) as RawEdit[]

const sources = collectSources(records).sort((a, b) =>
  // Locale-aware and case-insensitive. The list is alphabetical so it can be
  // used as an index; a plain codepoint sort files every lowercase title after
  // every uppercase one, which scatters related titles across the page.
  a.srcName.localeCompare(b.srcName, 'en', { sensitivity: 'base' }),
)

writeFileSync(output, `${JSON.stringify(sources, null, 0)}\n`)

const withUrl = sources.filter(source => source.srcURL).length

console.log(`\n✓ ${sources.length} sources from ${records.length.toLocaleString()} clips`)
console.log(`  ${withUrl} linked, ${sources.length - withUrl} without a URL`)
console.log(`  → server/assets/sources.json\n`)
