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
    expect(publicBlock.toLowerCase()).not.toMatch(/token|secret|password|credential|serviceToken/i)
  })

  it('the service token is declared server-side, not under public', () => {
    const publicIndex = nuxtConfig.indexOf('public: {')
    const tokenIndex = nuxtConfig.indexOf('directusServiceToken')

    expect(tokenIndex).toBeGreaterThan(-1)
    expect(tokenIndex).toBeLessThan(publicIndex)
  })
})
