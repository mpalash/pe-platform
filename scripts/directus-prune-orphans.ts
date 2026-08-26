/**
 * Deletes block items that no page references.
 *
 *   pnpm directus:prune          — report only, changes nothing
 *   pnpm directus:prune --delete — actually delete
 *
 * Why this exists: re-seeding replaces a page's `blocks` array, which drops the
 * junction rows but leaves the block items behind. Three re-seeds left 42
 * orphans cluttering every block collection in the admin. `seed-pages.ts` now
 * cleans up after itself, so this is for tidying what already accumulated —
 * and for the same mess made by hand in the admin, which is easy to do.
 *
 * Reports by default. Deleting content is not something a script should do
 * because you ran it without reading it first.
 */

import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

loadDotEnv(resolve(repoRoot, '.env'))

const directusUrl = (process.env['NUXT_DIRECTUS_URL'] ?? 'http://localhost:8055').replace(/\/$/, '')
const serviceToken = process.env['NUXT_DIRECTUS_SERVICE_TOKEN'] ?? ''

function loadDotEnv(path: string): void {
  if (!existsSync(path)) return
  for (const rawLine of readFileSync(path, 'utf8').split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    const key = line.slice(0, eq).trim()
    if (!(key in process.env)) process.env[key] = line.slice(eq + 1).trim()
  }
}

async function api<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${directusUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${serviceToken}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  })

  if (response.status === 204) return undefined as T

  const body = await response.json().catch(() => ({})) as {
    data?: T
    errors?: Array<{ message: string }>
  }

  if (!response.ok) {
    throw new Error(`${init.method ?? 'GET'} ${path} → ${response.status}: ${body.errors?.[0]?.message}`)
  }

  return body.data as T
}

export const BLOCK_COLLECTIONS = [
  'block_richtext',
  'block_media',
  'block_logos',
  'block_marquee',
  'block_people',
  'block_faq',
  'block_advisory',
]

async function main(): Promise<void> {
  const shouldDelete = process.argv.includes('--delete')

  // Every block id any page currently points at.
  const junction = await api<Array<{ collection: string, item: string }>>(
    '/items/pages_blocks?fields=collection,item&limit=-1',
  )

  const referenced = new Set(junction.map(row => `${row.collection}:${row.item}`))

  console.log(`\n${junction.length} block(s) referenced by pages.\n`)

  let orphanTotal = 0

  for (const collection of BLOCK_COLLECTIONS) {
    const items = await api<Array<{ id: string }>>(
      `/items/${collection}?fields=id&limit=-1`,
    ).catch(() => [])

    const orphans = items.filter(item => !referenced.has(`${collection}:${item.id}`))
    orphanTotal += orphans.length

    if (orphans.length === 0) {
      console.log(`  = ${collection}: ${items.length} item(s), none orphaned`)
      continue
    }

    console.log(`  ${shouldDelete ? '-' : '!'} ${collection}: ${orphans.length} orphaned of ${items.length}`)

    if (shouldDelete) {
      // Batch delete — one request per collection rather than per item.
      await api(`/items/${collection}`, {
        method: 'DELETE',
        body: JSON.stringify(orphans.map(item => item.id)),
      })
    }
  }

  if (orphanTotal === 0) {
    console.log('\n✓ Nothing orphaned.\n')
    return
  }

  if (shouldDelete) {
    console.log(`\n✓ Deleted ${orphanTotal} orphaned block item(s).\n`)
  }
  else {
    console.log(`\n${orphanTotal} orphaned block item(s) found. Nothing was changed.`)
    console.log('Re-run with --delete to remove them.\n')
  }
}

await main()
