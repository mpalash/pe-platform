/**
 * Directus schema snapshot / apply.
 *
 *   pnpm directus:snapshot   — export the live schema to directus/migrations/
 *   pnpm directus:apply      — apply the committed schema to the live Directus
 *
 * Hard rule 12: a schema change clicked into the admin UI is snapshotted and
 * committed in the same PR as the code that depends on it. This script is the
 * whole mechanism — no ORM, no migration framework, no new dependency.
 *
 * Uses plain fetch against the Directus schema API. Node 22+ has fetch built in.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const snapshotPath = resolve(repoRoot, 'directus/migrations/schema.json')

loadDotEnv(resolve(repoRoot, '.env'))

const directusUrl = (process.env['NUXT_DIRECTUS_URL'] ?? 'http://localhost:8055').replace(/\/$/, '')
const serviceToken = process.env['NUXT_DIRECTUS_SERVICE_TOKEN'] ?? ''

/** Minimal .env reader — avoids a dependency for something this small. */
function loadDotEnv(path: string): void {
  if (!existsSync(path)) return
  for (const rawLine of readFileSync(path, 'utf8').split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    const key = line.slice(0, eq).trim()
    const value = line.slice(eq + 1).trim()
    if (!(key in process.env)) process.env[key] = value
  }
}

async function api(path: string, init: RequestInit = {}): Promise<Response> {
  if (!serviceToken) {
    fail('NUXT_DIRECTUS_SERVICE_TOKEN is not set. Copy .env.example to .env first.')
  }

  let response: Response
  try {
    response = await fetch(`${directusUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${serviceToken}`,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
      },
    })
  }
  catch {
    fail(`Cannot reach Directus at ${directusUrl}. Is \`docker compose up\` running?`)
  }

  if (!response.ok && response.status !== 204) {
    const body = await response.text()
    fail(`Directus answered ${response.status} for ${path}\n${body}`)
  }

  return response
}

function fail(message: string): never {
  console.error(`\n✗ ${message}\n`)
  process.exit(1)
}

async function snapshot(): Promise<void> {
  const response = await api('/schema/snapshot')
  const { data } = await response.json() as { data: unknown }

  await mkdir(dirname(snapshotPath), { recursive: true })
  await writeFile(snapshotPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8')

  const collections = (data as { collections?: unknown[] }).collections?.length ?? 0
  const fields = (data as { fields?: unknown[] }).fields?.length ?? 0
  console.log(`✓ Snapshot written to directus/migrations/schema.json`)
  console.log(`  ${collections} collections, ${fields} fields. Commit this alongside the code that needs it.`)
}

async function apply(force: boolean): Promise<void> {
  if (!existsSync(snapshotPath)) {
    fail('No snapshot at directus/migrations/schema.json. Run `pnpm directus:snapshot` first.')
  }

  const committed = await readFile(snapshotPath, 'utf8')

  const diffResponse = await api(`/schema/diff${force ? '?force=true' : ''}`, {
    method: 'POST',
    body: committed,
  })

  // 204 means the live schema already matches the snapshot.
  if (diffResponse.status === 204) {
    console.log('✓ Live schema already matches the committed snapshot. Nothing to apply.')
    return
  }

  const { data: diff } = await diffResponse.json() as { data: unknown }

  /*
   * The payload is the diff object exactly as `/schema/diff` returned it —
   * `{ hash, diff }` — NOT wrapped in `{ data }`. Directus validates the hash
   * against the live schema so a diff taken against a database that has since
   * moved is rejected rather than half-applied. Wrapping it loses the hash and
   * the endpoint answers 400 `"hash" is required`.
   *
   * This only ever bites against a database whose schema differs from the
   * snapshot: locally the diff is 204 and this line never runs.
   */
  await api('/schema/apply', {
    method: 'POST',
    body: JSON.stringify(diff),
  })

  console.log('✓ Committed schema applied to Directus.')
}

const command = process.argv[2]
const force = process.argv.includes('--force')

switch (command) {
  case 'snapshot':
    await snapshot()
    break
  case 'apply':
    await apply(force)
    break
  default:
    fail('Usage: directus-schema.ts <snapshot|apply> [--force]')
}
