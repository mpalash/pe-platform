/**
 * Fills the `site_settings` and `navigation` singletons with real values.
 *
 *   pnpm directus:seed-settings
 *
 * Separate from seed-pages.ts because these are settings, not content: they are
 * written once and then edited by hand in the admin, so re-running this would
 * stamp on someone's edits. It therefore only writes fields that are currently
 * empty, and reports what it left alone.
 *
 * Pass --force to overwrite everything, which is what you want on a database
 * you have just recreated.
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

const SITE_SETTINGS: Record<string, unknown> = {
  site_name: 'purgatory EDIT',
  tagline: 'An experimental archive of conflict and its absence.',
  default_seo_title: 'purgatory EDIT',
  default_seo_description:
    'A public video archive of 30,000 clips graded from peace to war, with editorial research and a booking system for the installation.',
  og_site_name: 'purgatory EDIT',
  twitter_card: 'summary_large_image',
}

/**
 * Paths are checked against the real routes, not guessed from the labels. Two
 * of these were wrong on the first pass — /research-logs and /faq, where the
 * pages are /research and /faqs — and a nav link to a 404 is the kind of thing
 * that survives a long time because the label looks right.
 *
 * /archive and /source-index are application routes rather than Directus
 * pages, so they will never appear in the page tree the fallback walks; they
 * have to be named here.
 */
const NAV_LINKS = [
  { label: 'Archive', path: '/archive', external: false },
  { label: 'Source Index', path: '/source-index', external: false },
  { label: 'About', path: '/about', external: false },
  { label: 'Research logs', path: '/research', external: false },
  { label: 'Frequently asked questions', path: '/faqs', external: false },
  { label: 'Disclaimers', path: '/disclaimers', external: false },
]

function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true
  if (typeof value === 'string') return value.trim() === ''
  if (Array.isArray(value)) return value.length === 0
  return false
}

async function main(): Promise<void> {
  const force = process.argv.includes('--force')

  const current = await api<Record<string, unknown>>('/items/site_settings')
  const payload: Record<string, unknown> = {}
  const kept: string[] = []

  for (const [field, value] of Object.entries(SITE_SETTINGS)) {
    if (force || isEmpty(current?.[field])) payload[field] = value
    else kept.push(field)
  }

  if (Object.keys(payload).length > 0) {
    await api('/items/site_settings', { method: 'PATCH', body: JSON.stringify(payload) })
    console.log(`\n  + site_settings: ${Object.keys(payload).join(', ')}`)
  }
  else {
    console.log('\n  = site_settings: nothing empty to fill')
  }

  if (kept.length > 0) console.log(`  · left alone (already set): ${kept.join(', ')}`)

  const nav = await api<Record<string, unknown>>('/items/navigation')

  if (force || isEmpty(nav?.['links'])) {
    await api('/items/navigation', { method: 'PATCH', body: JSON.stringify({ links: NAV_LINKS }) })
    console.log(`  + navigation: ${NAV_LINKS.length} link(s)`)
  }
  else {
    console.log('  = navigation: already authored, left alone')
  }

  console.log('\n✓ Settings seeded.')
  console.log('  Edit them at http://localhost:8055/admin/content/site_settings\n')
}

await main()
