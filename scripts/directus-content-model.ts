/**
 * Creates the Phase 4 content model in Directus.
 *
 *   pnpm directus:model
 *
 * Why a script rather than clicking it into the admin: this has to be
 * reproducible on a clean database, and reviewable in a diff. Hard rule 12 says
 * schema changes are committed — `pnpm directus:snapshot` captures the result,
 * and this file records the intent that produced it.
 *
 * Idempotent: existing collections and fields are left alone, so it is safe to
 * re-run after adding a block type.
 *
 * The model itself is argued for in docs/plan/04-phase-4-content-model.md §4.1.
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

async function api<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<{ ok: boolean, status: number, data?: T | undefined, error?: string | undefined }> {
  const response = await fetch(`${directusUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${serviceToken}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  })

  if (response.status === 204) return { ok: true, status: 204 }

  const body = await response.json().catch(() => ({})) as { data?: T, errors?: Array<{ message: string }> }

  if (!response.ok) {
    return { ok: false, status: response.status, error: body.errors?.[0]?.message ?? String(response.status) }
  }

  return { ok: true, status: response.status, data: body.data }
}

/* ── helpers ─────────────────────────────────────────────────────────────── */

async function collectionExists(name: string): Promise<boolean> {
  const result = await api(`/collections/${name}`)
  return result.ok
}

interface FieldSpec {
  field: string
  type: string
  meta?: Record<string, unknown>
  schema?: Record<string, unknown>
}

async function ensureCollection(
  name: string,
  meta: Record<string, unknown>,
  fields: FieldSpec[],
): Promise<void> {
  if (await collectionExists(name)) {
    console.log(`  = ${name} (exists)`)
    await ensureFields(name, fields)
    return
  }

  const result = await api('/collections', {
    method: 'POST',
    body: JSON.stringify({
      collection: name,
      meta: { singleton: false, ...meta },
      schema: { name },
      fields: [
        {
          field: 'id',
          type: 'uuid',
          meta: { hidden: true, readonly: true, interface: 'input', special: ['uuid'] },
          schema: { is_primary_key: true, length: 36, has_auto_increment: false },
        },
        ...fields,
      ],
    }),
  })

  if (!result.ok) throw new Error(`Creating ${name}: ${result.error}`)
  console.log(`  + ${name}`)
}

async function ensureFields(collection: string, fields: FieldSpec[]): Promise<void> {
  const existing = await api<Array<{ field: string }>>(`/fields/${collection}`)
  const have = new Set((existing.data ?? []).map(f => f.field))

  for (const field of fields) {
    if (have.has(field.field)) continue
    const result = await api(`/fields/${collection}`, { method: 'POST', body: JSON.stringify(field) })
    if (!result.ok) throw new Error(`Adding ${collection}.${field.field}: ${result.error}`)
    console.log(`  + ${collection}.${field.field}`)
  }
}

/* ── field shorthands ────────────────────────────────────────────────────── */

const text = (field: string, opts: { required?: boolean, note?: string, width?: string } = {}): FieldSpec => ({
  field,
  type: 'string',
  meta: {
    interface: 'input',
    required: opts.required ?? false,
    note: opts.note ?? null,
    width: opts.width ?? 'full',
  },
  schema: { is_nullable: !opts.required },
})

const richtext = (field: string, note?: string): FieldSpec => ({
  field,
  type: 'text',
  meta: {
    interface: 'input-rich-text-html',
    note: note ?? null,
    options: {
      toolbar: [
        'bold', 'italic', 'underline', 'removeformat', 'link', 'blockquote',
        'h2', 'h3', 'h4', 'bullist', 'numlist', 'code', 'hr', 'table', 'fullscreen',
      ],
    },
  },
  schema: { is_nullable: true },
})

const longText = (field: string, note?: string): FieldSpec => ({
  field,
  type: 'text',
  meta: { interface: 'input-multiline', note: note ?? null },
  schema: { is_nullable: true },
})

const anchor = (): FieldSpec => ({
  field: 'anchor',
  type: 'string',
  meta: {
    interface: 'input',
    width: 'half',
    note: 'Optional id for in-page links, e.g. `team` → #team. The table of contents is derived from these.',
  },
  schema: { is_nullable: true },
})

const image = (field: string, note?: string): FieldSpec => ({
  field,
  type: 'uuid',
  meta: { interface: 'file-image', special: ['file'], note: note ?? null },
  schema: { is_nullable: true },
})

const json = (field: string, options: Record<string, unknown>, note?: string): FieldSpec => ({
  field,
  type: 'json',
  meta: { interface: 'list', options, note: note ?? null, special: ['cast-json'] },
  schema: { is_nullable: true },
})

/* ── the model ───────────────────────────────────────────────────────────── */

const BLOCKS = [
  'block_richtext',
  'block_media',
  'block_logos',
  'block_people',
  'block_faq',
  'block_advisory',
] as const

async function main(): Promise<void> {
  if (!serviceToken) {
    console.error('\n✗ NUXT_DIRECTUS_SERVICE_TOKEN is not set. Copy .env.example to .env.\n')
    process.exit(1)
  }

  const ping = await api('/server/ping').catch(() => ({ ok: false }))
  if (!ping.ok) {
    console.error(`\n✗ Cannot reach Directus at ${directusUrl}. Is \`docker compose up\` running?\n`)
    process.exit(1)
  }

  console.log('\nBlocks')

  await ensureCollection('block_richtext', {
    icon: 'article',
    note: 'Prose. The workhorse block — Phase 2 base styles handle everything it emits.',
  }, [
    text('title', { note: 'Optional section heading rendered above the prose.' }),
    anchor(),
    richtext('body'),
  ])

  await ensureCollection('block_media', {
    icon: 'image',
    note: 'An image or a video, with a caption and a display mode.',
  }, [
    image('file', 'Leave empty and set Video URL for externally hosted video.'),
    text('video_url', { note: 'Must be a CloudFront URL. Never a direct s3.amazonaws.com link — hard rule 3.' }),
    text('caption'),
    text('alt', { note: 'Describe the image for someone who cannot see it. Required for images.' }),
    {
      field: 'ratio',
      type: 'string',
      meta: {
        interface: 'select-dropdown',
        width: 'half',
        options: {
          choices: [
            { text: '16 : 9', value: '16 / 9' },
            { text: '21 : 9 (cinema)', value: '21 / 9' },
            { text: '1 : 1', value: '1' },
            { text: '3 : 4 (portrait)', value: '3 / 4' },
          ],
        },
      },
      schema: { is_nullable: true, default_value: '16 / 9' },
    },
    {
      field: 'display',
      type: 'string',
      meta: {
        interface: 'select-dropdown',
        width: 'half',
        options: {
          choices: [
            { text: 'Inline — within the measure', value: 'inline' },
            { text: 'Full bleed — edge to edge', value: 'bleed' },
          ],
        },
      },
      schema: { is_nullable: true, default_value: 'inline' },
    },
    anchor(),
  ])

  await ensureCollection('block_logos', {
    icon: 'grid_view',
    note: 'A group of supporter logos under a heading. Home page uses four of these.',
  }, [
    text('title', { note: 'e.g. FUNDING SUPPORT' }),
    anchor(),
    json('logos', {
      template: '{{ name }}',
      fields: [
        { field: 'name', type: 'string', name: 'Name', meta: { interface: 'input', required: true } },
        { field: 'image', type: 'uuid', name: 'Logo', meta: { interface: 'file-image', special: ['file'] } },
        { field: 'url', type: 'string', name: 'Link', meta: { interface: 'input' } },
      ],
    }, 'Each logo needs a name — it is the alt text as well as the label.'),
  ])

  await ensureCollection('block_people', {
    icon: 'group',
    note: 'Named people with roles. Used twice on About, with different framing.',
  }, [
    text('title', { note: 'e.g. TEAM, or Institutional collaborators' }),
    anchor(),
    richtext('intro', 'Optional prose above the list.'),
    json('people', {
      template: '{{ name }}',
      fields: [
        { field: 'name', type: 'string', name: 'Name', meta: { interface: 'input', required: true } },
        { field: 'role', type: 'string', name: 'Role', meta: { interface: 'input' } },
        { field: 'url', type: 'string', name: 'Link', meta: { interface: 'input' } },
      ],
    }),
  ])

  await ensureCollection('block_faq', {
    icon: 'help',
    note: 'Question and answer pairs. Each question gets its own anchor.',
  }, [
    text('title', { note: 'e.g. General, Archive, Performance' }),
    anchor(),
    json('items', {
      template: '{{ question }}',
      fields: [
        { field: 'question', type: 'string', name: 'Question', meta: { interface: 'input', required: true } },
        { field: 'answer', type: 'text', name: 'Answer', meta: { interface: 'input-rich-text-html' } },
      ],
    }),
  ])

  await ensureCollection('block_advisory', {
    icon: 'warning',
    note: 'A content warning. On an archive of violence this is an ethical obligation, not a callout style.',
  }, [
    text('title', { required: true, note: 'e.g. VISUAL DISCLAIMER & ADVISORY' }),
    anchor(),
    {
      field: 'severity',
      type: 'string',
      meta: {
        interface: 'select-dropdown',
        width: 'half',
        options: {
          choices: [
            { text: 'Note — informational', value: 'note' },
            { text: 'Advisory — read before continuing', value: 'advisory' },
          ],
        },
      },
      schema: { is_nullable: true, default_value: 'advisory' },
    },
    richtext('body'),
    longText('detail', 'Optional long list — rendered inside a disclosure so it does not wall off the page.'),
    text('detail_label', { note: 'Label for the disclosure, e.g. "Show the full list of depicted content".' }),
  ])

  console.log('\nPages')

  /*
   * No stored `path` column, deliberately.
   *
   * The plan offers two options: cache the resolved path, or maintain a `path`
   * field via a Flow on save. A Flow is the wrong half of that choice — hard
   * rule 8 says Flows are not a job queue, and a Flow that misses one save
   * leaves a page permanently unreachable at a URL that looks correct in the
   * admin. Paths are derived from the parent chain in `server/utils/pages.ts`
   * against the whole tree, fetched once and cached. At this site's scale the
   * tree is a single small query, and it cannot drift.
   */
  await ensureCollection('pages', {
    icon: 'description',
    note: 'The page tree. Hierarchy is the self-referencing parent field.',
    display_template: '{{ title }}',
    sort_field: 'sort',
    archive_field: 'status',
    archive_value: 'archived',
    unarchive_value: 'draft',
  }, [
    {
      field: 'status',
      type: 'string',
      meta: {
        interface: 'select-dropdown',
        width: 'half',
        options: {
          choices: [
            { text: 'Published', value: 'published' },
            { text: 'Draft', value: 'draft' },
            { text: 'Archived', value: 'archived' },
          ],
        },
      },
      // Draft by default: publishing should be a decision, not the absence of one.
      schema: { is_nullable: false, default_value: 'draft' },
    },
    { field: 'sort', type: 'integer', meta: { interface: 'input', hidden: true }, schema: { is_nullable: true } },
    text('title', { required: true, width: 'half' }),
    text('slug', {
      required: true,
      width: 'half',
      note: 'Unique per parent, not globally. Empty string is the home page.',
    }),
    longText('summary', 'One or two sentences. Used for listings and as the SEO description fallback.'),
    text('seo_title', { note: 'Overrides the page title in <title> and share cards.' }),
    longText('seo_description'),
    image('seo_image', 'Share image. 1200×630 or thereabouts.'),
  ])

  // Self-referencing parent — created after the collection so it can point at itself.
  await ensureFields('pages', [{
    field: 'parent',
    type: 'uuid',
    meta: {
      interface: 'select-dropdown-m2o',
      special: ['m2o'],
      width: 'half',
      options: { template: '{{ title }}' },
      note: 'The page this one sits under. Empty means top level.',
    },
    schema: { is_nullable: true },
  }])

  const relations = await api<Array<{ collection: string, field: string }>>('/relations')
  const hasRelation = (collection: string, field: string) =>
    (relations.data ?? []).some(r => r.collection === collection && r.field === field)

  if (!hasRelation('pages', 'parent')) {
    const result = await api('/relations', {
      method: 'POST',
      body: JSON.stringify({
        collection: 'pages',
        field: 'parent',
        related_collection: 'pages',
        meta: { sort_field: null },
        schema: { on_delete: 'SET NULL' },
      }),
    })
    if (!result.ok) throw new Error(`pages.parent relation: ${result.error}`)
    console.log('  + pages.parent → pages')
  }

  /* ── M2A: pages.blocks → the block collections ─────────────────────────── */

  console.log('\nBlock builder (M2A)')

  if (!(await collectionExists('pages_blocks'))) {
    await api('/collections', {
      method: 'POST',
      body: JSON.stringify({
        collection: 'pages_blocks',
        meta: { hidden: true, icon: 'import_export' },
        schema: { name: 'pages_blocks' },
        fields: [
          {
            field: 'id',
            type: 'integer',
            meta: { hidden: true },
            schema: { is_primary_key: true, has_auto_increment: true },
          },
        ],
      }),
    })
    console.log('  + pages_blocks')
  }

  await ensureFields('pages_blocks', [
    { field: 'pages_id', type: 'uuid', meta: { hidden: true }, schema: { is_nullable: true } },
    { field: 'item', type: 'string', meta: { hidden: true }, schema: { is_nullable: true } },
    { field: 'collection', type: 'string', meta: { hidden: true }, schema: { is_nullable: true } },
    { field: 'sort', type: 'integer', meta: { hidden: true }, schema: { is_nullable: true } },
  ])

  await ensureFields('pages', [{
    field: 'blocks',
    type: 'alias',
    meta: {
      interface: 'list-m2a',
      special: ['m2a'],
      options: { enableSelect: false },
      note: 'The page. Add, reorder and nest content blocks here.',
    },
  }])

  if (!hasRelation('pages_blocks', 'pages_id')) {
    await api('/relations', {
      method: 'POST',
      body: JSON.stringify({
        collection: 'pages_blocks',
        field: 'pages_id',
        related_collection: 'pages',
        meta: { one_field: 'blocks', sort_field: 'sort', one_deselect_action: 'delete' },
        schema: { on_delete: 'CASCADE' },
      }),
    })
    console.log('  + pages_blocks.pages_id → pages')
  }

  if (!hasRelation('pages_blocks', 'item')) {
    await api('/relations', {
      method: 'POST',
      body: JSON.stringify({
        collection: 'pages_blocks',
        field: 'item',
        meta: { one_allowed_collections: BLOCKS, one_collection_field: 'collection', junction_field: 'pages_id' },
      }),
    })
    console.log('  + pages_blocks.item → any block')
  }

  console.log('\n✓ Content model in place.')
  console.log('  Run `pnpm directus:snapshot` and commit directus/migrations/schema.json.\n')
}

await main()
