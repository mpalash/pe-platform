import { createDirectus, readSingleton, rest, staticToken } from '@directus/sdk'
import type { DirectusClient, RestClient, StaticTokenClient } from '@directus/sdk'

/**
 * Server-only Directus client.
 *
 * This module lives under `server/` and is therefore never bundled for the
 * browser. The service token it reads is a full-admin credential — anything
 * involving a secret, a session, or an authorization decision goes through a
 * Nitro route that uses this, never a client-side call to Directus.
 *
 * `pnpm check:bundle` greps the built client output for the token and fails the
 * build if it appears. That check is the guard; this comment is the reason.
 */

/**
 * Collections map to arrays of records — that shape is what lets `readItems`
 * accept a collection name at all. A plain `Record<string, unknown>` typechecks
 * on its own but makes every `readItems('pages')` an error, because the SDK
 * infers valid collection names from it.
 *
 * Still deliberately loose on item shape: Phase 4 owns the content model, and
 * generated collection types belong with it rather than hand-written here.
 */
export type PlatformSchema = Record<string, Record<string, unknown>[]>

type PlatformDirectusClient
  = DirectusClient<PlatformSchema>
    & StaticTokenClient<PlatformSchema>
    & RestClient<PlatformSchema>

let client: PlatformDirectusClient | undefined

/**
 * Lazily built so runtimeConfig is read at request time rather than at import
 * time — otherwise the values are baked in during build, which is wrong for
 * anything deployed.
 */
export function useDirectus(): PlatformDirectusClient {
  if (client) return client

  const config = useRuntimeConfig()
  /*
   * Prerendering the editorial pages happens during the BUILD, and a build
   * cannot always reach the address the running server uses. On Railway the
   * server talks to Directus over the private network, which builds do not
   * get — so PRERENDER_DIRECTUS_URL (the public address) is used while
   * prerendering, and only then. Unset, as it is locally, the normal URL
   * serves both. See docs/plan/RAILWAY.md.
   */
  const url = (import.meta.prerender && process.env.PRERENDER_DIRECTUS_URL) || config.directusUrl
  const token = config.directusServiceToken

  if (!url) {
    throw createError({
      statusCode: 500,
      statusMessage: 'NUXT_DIRECTUS_URL is not set. Copy .env.example to .env.',
    })
  }

  if (!token) {
    throw createError({
      statusCode: 500,
      statusMessage: 'NUXT_DIRECTUS_SERVICE_TOKEN is not set. Copy .env.example to .env.',
    })
  }

  client = createDirectus<PlatformSchema>(url)
    .with(staticToken(token))
    .with(rest())

  return client
}

/** Test seam — lets a test force a rebuild against changed config. */
export function resetDirectusClient(): void {
  client = undefined
}

/**
 * Reads a Directus singleton as a plain object.
 *
 * `PlatformSchema` maps every collection name to an ARRAY of records, which is
 * exactly what makes `readItems('pages')` typecheck. `readSingleton` wants the
 * opposite — a collection whose type is a single object — so under this schema
 * its parameter narrows to `never` and no collection name can satisfy it.
 *
 * The two could be reconciled by declaring each singleton on the schema type,
 * but an index signature and a named non-array member cannot coexist: the
 * intersection collapses back to `never`. Properly typed collections are a
 * generated-types job, and that belongs with the content model rather than
 * hand-written here.
 *
 * So the cast is deliberate and local. It is safe in the way that matters:
 * Directus returns an object for a singleton read regardless of what the type
 * parameter claims, and every caller validates the fields it actually uses.
 *
 * Returns null when the collection is missing or unreadable — a database that
 * has had the schema applied but never been opened is a normal state, not an
 * error, and the site has to render either way.
 */
export async function readDirectusSingleton(
  collection: string,
): Promise<Record<string, unknown> | null> {
  try {
    const record = await useDirectus().request(
      readSingleton(collection as never),
    ) as Record<string, unknown> | null

    return record ?? null
  }
  catch {
    return null
  }
}
