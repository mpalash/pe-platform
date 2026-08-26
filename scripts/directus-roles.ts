/**
 * Editor role, public read permissions, and the Live Preview URL.
 *
 *   pnpm directus:roles
 *
 * Phase 4 §4.6 and §4.7. Scripted rather than clicked so it is reproducible on
 * a clean database and reviewable in a diff — and so the permissions can be
 * verified by request rather than by reading a matrix, which is the normal way
 * a permissions bug survives.
 *
 * Idempotent.
 */

import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

loadDotEnv(resolve(repoRoot, '.env'))

const directusUrl = (process.env['NUXT_DIRECTUS_URL'] ?? 'http://localhost:8055').replace(/\/$/, '')
const serviceToken = process.env['NUXT_DIRECTUS_SERVICE_TOKEN'] ?? ''
const siteUrl = (process.env['NUXT_PUBLIC_SITE_URL'] ?? 'http://localhost:3000').replace(/\/$/, '')
const previewToken = process.env['NUXT_PREVIEW_TOKEN'] ?? 'local-development-preview-token'

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

const BLOCKS = [
  'block_richtext',
  'block_media',
  'block_logos',
  'block_marquee',
  'block_people',
  'block_faq',
  'block_advisory',
]

const EDITOR_COLLECTIONS = ['pages', 'pages_blocks', ...BLOCKS]

interface Policy { id: string, name: string }

async function main(): Promise<void> {
  /* ── Live Preview ──────────────────────────────────────────────────────── */

  // Keyed by id rather than slug: a slug alone cannot address a nested page,
  // and a draft may not have a resolvable path at all yet.
  const previewUrl = `${siteUrl}/preview?id={{id}}&token=${previewToken}`

  await api('/collections/pages', {
    method: 'PATCH',
    body: JSON.stringify({ meta: { preview_url: previewUrl } }),
  })
  console.log(`✓ Live Preview → ${siteUrl}/preview?id={{id}}&token=…`)

  /* ── Editor policy and role ────────────────────────────────────────────── */

  const policies = await api<Policy[]>('/policies?filter[name][_eq]=Editor&limit=1&fields=id,name')
  let policyId = policies[0]?.id

  if (!policyId) {
    const created = await api<Policy>('/policies', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Editor',
        icon: 'edit',
        description: 'Content editing only. No users, no schema, no settings.',
        app_access: true,
        admin_access: false,
      }),
    })
    policyId = created.id
    console.log('✓ Editor policy created')
  }
  else {
    console.log('= Editor policy exists')
  }

  const existingPermissions = await api<Array<{ id: number, collection: string, action: string, policy: string }>>(
    `/permissions?filter[policy][_eq]=${policyId}&limit=-1&fields=id,collection,action,policy`,
  )

  const have = new Set(existingPermissions.map(p => `${p.collection}:${p.action}`))

  for (const collection of EDITOR_COLLECTIONS) {
    for (const action of ['create', 'read', 'update', 'delete']) {
      if (have.has(`${collection}:${action}`)) continue
      await api('/permissions', {
        method: 'POST',
        body: JSON.stringify({
          policy: policyId,
          collection,
          action,
          fields: ['*'],
          permissions: {},
          validation: {},
        }),
      })
    }
  }

  // Editors need to upload and see assets, but not administer the file library.
  for (const action of ['create', 'read', 'update']) {
    if (have.has(`directus_files:${action}`)) continue
    await api('/permissions', {
      method: 'POST',
      body: JSON.stringify({
        policy: policyId,
        collection: 'directus_files',
        action,
        fields: ['*'],
        permissions: {},
        validation: {},
      }),
    })
  }

  console.log(`✓ Editor permissions on ${EDITOR_COLLECTIONS.length} collections + files`)
  console.log('  Deliberately absent: users, roles, policies, settings, schema.')

  const roles = await api<Array<{ id: string }>>('/roles?filter[name][_eq]=Editor&limit=1&fields=id')

  if (!roles[0]) {
    await api('/roles', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Editor',
        icon: 'edit',
        description: 'Content editors. Created ahead of anyone using it — see Phase 4 §4.7.',
        policies: [{ policy: policyId }],
      }),
    })
    console.log('✓ Editor role created (no members — editors are onboarded after the content design settles)')
  }
  else {
    console.log('= Editor role exists')
  }

  /* ── Public: nothing ───────────────────────────────────────────────────── */

  /*
   * The public role gets NO read permission on pages or blocks, deliberately.
   *
   * Every public read goes through a Nitro route using the service token, which
   * filters to status = 'published'. Granting Directus public read as well would
   * create a second, unfiltered path to the same data — and the one that leaks
   * drafts is always the one nobody remembered to filter.
   */
  const publicPermissions = await api<Array<{ id: number, collection: string }>>(
    '/permissions?filter[policy][_null]=true&limit=-1&fields=id,collection',
  )

  const publicOnContent = publicPermissions.filter(p =>
    EDITOR_COLLECTIONS.includes(p.collection),
  )

  if (publicOnContent.length > 0) {
    console.log(`⚠ public role has ${publicOnContent.length} permission(s) on content collections — removing`)
    for (const permission of publicOnContent) {
      await api(`/permissions/${permission.id}`, { method: 'DELETE' })
    }
  }
  else {
    console.log('✓ Public role has no direct access to content collections (by design)')
  }

  console.log('\n✓ Roles and preview configured.\n')
}

await main()
