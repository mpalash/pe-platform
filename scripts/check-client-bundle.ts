/**
 * Proves the Directus service token is absent from the client bundle.
 *
 *   pnpm build && pnpm check:bundle
 *
 * Phase 1 §1.4 asks for exactly this: "a build-time check or a test that greps
 * the client bundle for it — this is a mistake that is easy to make and
 * expensive to discover."
 *
 * Greps everything shipped to browsers: `.output/public`. The server bundle is
 * deliberately not checked — the token belongs there.
 */

import { readdir, readFile, stat } from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve, relative, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const clientDir = resolve(repoRoot, '.output/public')

/** Values that must never appear in anything served to a browser. */
function forbiddenValues(): Array<{ label: string, value: string }> {
  const found: Array<{ label: string, value: string }> = []

  const token = process.env['NUXT_DIRECTUS_SERVICE_TOKEN'] ?? readEnvFile()['NUXT_DIRECTUS_SERVICE_TOKEN']
  if (token) found.push({ label: 'NUXT_DIRECTUS_SERVICE_TOKEN', value: token })

  // The config key name itself leaking is also a signal — it means a secret was
  // put somewhere public, even if this environment's value happens to be blank.
  found.push({ label: 'runtimeConfig key `directusServiceToken`', value: 'directusServiceToken' })

  return found
}

function readEnvFile(): Record<string, string> {
  const path = resolve(repoRoot, '.env')
  if (!existsSync(path)) return {}

  const out: Record<string, string> = {}
  for (const rawLine of readFileSync(path, 'utf8').split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    out[line.slice(0, eq).trim()] = line.slice(eq + 1).trim()
  }
  return out
}

async function* walk(dir: string): AsyncGenerator<string> {
  for (const entry of await readdir(dir)) {
    const full = join(dir, entry)
    const info = await stat(full)
    if (info.isDirectory()) yield* walk(full)
    else yield full
  }
}

async function main(): Promise<void> {
  if (!existsSync(clientDir)) {
    console.error('\n✗ No client build at .output/public. Run `pnpm build` first.\n')
    process.exit(1)
  }

  const forbidden = forbiddenValues()
  const hits: string[] = []
  let scanned = 0

  for await (const file of walk(clientDir)) {
    const contents = await readFile(file, 'utf8').catch(() => '') // binaries read as ''
    if (!contents) continue
    scanned++

    for (const { label, value } of forbidden) {
      if (contents.includes(value)) {
        hits.push(`${relative(repoRoot, file)} contains ${label}`)
      }
    }
  }

  if (hits.length > 0) {
    console.error('\n✗ SECRET IN CLIENT BUNDLE\n')
    for (const hit of hits) console.error(`  ${hit}`)
    console.error('\nThe Directus service token is a full-admin credential. It is server-only.')
    console.error('Move the call behind a Nitro server route.\n')
    process.exit(1)
  }

  console.log(`✓ ${scanned} client files scanned. No Directus service token present.`)
}

await main()
