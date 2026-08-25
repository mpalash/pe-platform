import { createDirectus, rest, staticToken } from '@directus/sdk'
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

// The schema is deliberately untyped for now — Phase 4 models content and can
// generate real collection types then. `any` here would be worse than unknown:
// a loose record keeps the SDK generic happy without inventing collections.
export type PlatformSchema = Record<string, unknown>

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
  const url = config.directusUrl
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
