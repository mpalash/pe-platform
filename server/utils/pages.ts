import { readItems } from '@directus/sdk'

/**
 * Page tree resolution.
 *
 * A page's URL is derived by walking `parent`, never stored. The plan allowed
 * either a cached resolution or a `path` field maintained by a Flow; this is the
 * first. A Flow that misses a single save leaves a page unreachable at a URL
 * that still looks correct in the admin, and hard rule 8 is clear that Flows
 * are not where correctness lives.
 *
 * The whole tree is one small query — this site has tens of pages, not
 * thousands — so resolution is exact rather than eventually consistent.
 */

export interface PageNode {
  id: string
  status: string
  title: string
  slug: string
  parent: string | null
  sort: number | null
}

export interface ResolvedPage extends PageNode {
  /** Leading-slash URL path. The home page (empty slug, no parent) is '/'. */
  path: string
}

/** Blocks arrive from the M2A junction; `collection` names the block type. */
export interface PageBlock {
  id: number
  collection: string
  sort: number | null
  item: Record<string, unknown> | null
}

export interface PageWithBlocks extends ResolvedPage {
  summary: string | null
  seo_title: string | null
  seo_description: string | null
  seo_image: string | null
  /** Whether the floating ambient clip player appears on this page. */
  show_ambient_video: boolean
  blocks: PageBlock[]
}

function joinPath(segments: string[]): string {
  const path = segments.filter(Boolean).join('/')
  return path ? `/${path}` : '/'
}

/**
 * Resolves every page's path in one pass.
 *
 * Cycles are possible — Directus will happily let an editor set a page's parent
 * to its own descendant — so the walk is depth-limited rather than trusting the
 * data. A cyclic page resolves to no path and is dropped, which is visibly
 * broken rather than an infinite loop in a request handler.
 */
export function resolvePaths(nodes: PageNode[]): ResolvedPage[] {
  const byId = new Map(nodes.map(node => [node.id, node]))
  const resolved: ResolvedPage[] = []

  for (const node of nodes) {
    const segments: string[] = []
    let current: PageNode | undefined = node
    let depth = 0

    while (current && depth < 20) {
      segments.unshift(current.slug ?? '')
      current = current.parent ? byId.get(current.parent) : undefined
      depth++
    }

    if (depth >= 20) {
      console.error('[pages] parent cycle or excessive depth, skipping', { id: node.id, slug: node.slug })
      continue
    }

    resolved.push({ ...node, path: joinPath(segments) })
  }

  return resolved
}

/** Blocks come back as an unsorted junction; sort here so components need not. */
function sortBlocks(blocks: PageBlock[]): PageBlock[] {
  return [...blocks]
    .filter(block => block.item !== null)
    .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))
}

const publishedOnly = { status: { _eq: 'published' } }

/** Every published page with its resolved path. Used for nav and prerendering. */
export async function listPages(includeDrafts = false): Promise<ResolvedPage[]> {
  const directus = useDirectus()

  const nodes = await directus.request(
    readItems('pages', {
      fields: ['id', 'status', 'title', 'slug', 'parent', 'sort'],
      filter: includeDrafts ? {} : publishedOnly,
      limit: -1,
      sort: ['sort', 'title'],
    }),
  ) as unknown as PageNode[]

  return resolvePaths(nodes)
}

const PAGE_FIELDS = [
  'id', 'status', 'title', 'slug', 'parent', 'sort',
  'summary', 'seo_title', 'seo_description', 'seo_image', 'show_ambient_video',
  'blocks.id', 'blocks.collection', 'blocks.sort', 'blocks.item.*',
]

/**
 * One page with its blocks, by id, regardless of status.
 *
 * Only the token-guarded preview route calls this. It deliberately takes an id
 * rather than a path: a draft may have no resolvable path yet, and a slug alone
 * cannot address a nested page.
 */
export async function getPageById(id: string): Promise<PageWithBlocks | null> {
  const directus = useDirectus()

  const [page] = await directus.request(
    readItems('pages', { filter: { id: { _eq: id } }, limit: 1, fields: PAGE_FIELDS }),
  ) as unknown as Array<Omit<PageWithBlocks, 'path'>>

  if (!page) return null

  const all = await listPages(true)
  const path = all.find(candidate => candidate.id === page.id)?.path ?? '/'

  return { ...page, path, blocks: sortBlocks(page.blocks ?? []) }
}

/**
 * One page with its blocks, by URL path.
 *
 * `includeDrafts` exists for the Live Preview route and nothing else. It is
 * never reachable from a public request — the preview route is the only caller
 * that passes true, and it is token-guarded.
 */
export async function getPageByPath(
  path: string,
  includeDrafts = false,
): Promise<PageWithBlocks | null> {
  const wanted = path === '' ? '/' : path
  const pages = await listPages(includeDrafts)
  const match = pages.find(page => page.path === wanted)

  if (!match) return null

  const directus = useDirectus()

  const [full] = await directus.request(
    readItems('pages', {
      filter: { id: { _eq: match.id } },
      limit: 1,
      fields: PAGE_FIELDS,
    }),
  ) as unknown as Array<Omit<PageWithBlocks, 'path'>>

  if (!full) return null

  return { ...full, path: match.path, blocks: sortBlocks(full.blocks ?? []) }
}
