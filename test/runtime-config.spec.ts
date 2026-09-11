import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const repoRoot = resolve(import.meta.dirname, '..')
const envExample = readFileSync(resolve(repoRoot, '.env.example'), 'utf8')
const nuxtConfig = readFileSync(resolve(repoRoot, 'nuxt.config.ts'), 'utf8')

function declaredEnvVars(source: string): string[] {
  return [...source.matchAll(/^([A-Z][A-Z0-9_]*)=/gm)].map(match => match[1]!)
}

describe('.env.example and runtimeConfig agree', () => {
  const nuxtVars = declaredEnvVars(envExample).filter(name => name.startsWith('NUXT_'))

  it('documents at least the variables the app cannot start without', () => {
    expect(nuxtVars).toContain('NUXT_DIRECTUS_URL')
    expect(nuxtVars).toContain('NUXT_DIRECTUS_SERVICE_TOKEN')
  })

  // Phase 1 §1.1: ".env.example committed with every variable the app reads".
  // The reverse drift — a variable documented that nothing reads — is just as
  // misleading, so this checks both directions against nuxt.config's annotations.
  it.each(['NUXT_DIRECTUS_URL', 'NUXT_DIRECTUS_SERVICE_TOKEN', 'NUXT_SMTP_HOST', 'NUXT_SMTP_PORT', 'NUXT_SMTP_FROM', 'NUXT_SESSION_COOKIE_NAME', 'NUXT_SESSION_COOKIE_SECURE', 'NUXT_SESSION_TTL_DAYS', 'NUXT_PUBLIC_SITE_URL'])(
    '%s is both documented in .env.example and annotated in nuxt.config.ts',
    (name) => {
      expect(nuxtVars, `${name} missing from .env.example`).toContain(name)
      expect(nuxtConfig, `${name} not annotated in nuxt.config.ts`).toContain(name)
    },
  )

  it('has no NUXT_ variable in .env.example that nuxt.config.ts never mentions', () => {
    const orphans = nuxtVars.filter(name => !nuxtConfig.includes(name))
    expect(orphans).toEqual([])
  })
})

describe('secrets stay out of public runtime config', () => {
  /**
   * `runtimeConfig.public` is serialised into the client payload. A secret
   * placed there ships to every visitor. This catches the mistake in review
   * rather than in a bundle grep after the fact.
   */
  it('runtimeConfig.public contains no credential-shaped keys', () => {
    const publicBlock = nuxtConfig.match(/public:\s*\{([\s\S]*?)\n {4}\}/)?.[1] ?? ''
    expect(publicBlock).not.toBe('')

    // Key declarations only. Comments in this block legitimately mention tokens
    // — explaining why one is NOT here is the opposite of a violation.
    const declaredKeys = [...publicBlock.matchAll(/^\s*(\w+):/gm)].map(match => match[1]!)

    expect(declaredKeys.length).toBeGreaterThan(0)
    for (const key of declaredKeys) {
      expect(key, `runtimeConfig.public.${key} looks like a credential`)
        .not.toMatch(/token|secret|password|credential|key$/i)
    }
  })

  it('the service token is declared server-side, not under public', () => {
    const publicIndex = nuxtConfig.indexOf('public: {')
    const tokenIndex = nuxtConfig.indexOf('directusServiceToken')

    expect(tokenIndex).toBeGreaterThan(-1)
    expect(tokenIndex).toBeLessThan(publicIndex)
  })
})

describe('prerendered editorial pages', () => {
  const directus = readFileSync(resolve(repoRoot, 'server/utils/directus.ts'), 'utf8')

  it('prerenders by crawling from the home page, and fails the build on any error', () => {
    // A build that cannot reach Directus must go red, not ship pages rendered
    // from fallbacks under a green deploy.
    expect(nuxtConfig).toMatch(/crawlLinks: true/)
    expect(nuxtConfig).toMatch(/routes: \['\/'\]/)
    expect(nuxtConfig).toMatch(/failOnError: true/)
  })

  it.each(['/archive', '/experience-logs', '/source-index', '/preview'])(
    'does not prerender %s',
    (route) => {
      const ignore = nuxtConfig.match(/ignore: \[([^\]]*)\]/)?.[1] ?? ''
      expect(ignore).toContain(`'${route}'`)
    },
  )

  it('keeps Nitro\'s cache in memory while prerendering', () => {
    // On disk, a rebuild inside the swr window was served the previous
    // build's pages — a publish-then-redeploy could ship the old text, and a
    // build with Directus unreachable passed without asking it anything.
    expect(nuxtConfig).toMatch(/cache: \{ driver: 'memory' \}/)
  })

  it('uses the build-time Directus address only while prerendering', () => {
    expect(directus).toMatch(/\(import\.meta\.prerender && process\.env\.PRERENDER_DIRECTUS_URL\) \|\| config\.directusUrl/)
  })
})
