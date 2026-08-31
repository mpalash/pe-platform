import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const repoRoot = resolve(import.meta.dirname, '..')
const middlewareSource = readFileSync(resolve(repoRoot, 'server/middleware/noindex.ts'), 'utf8')
const nuxtConfig = readFileSync(resolve(repoRoot, 'nuxt.config.ts'), 'utf8')

/**
 * Comments stripped before asserting. The hostname check below is about the
 * LOGIC — a host compared in code is what silently misses the next domain —
 * and the file's header legitimately names `next.purgatoryedit.com` and the
 * generated railway.app hosts while explaining why it does not match on them.
 */
const middleware = middlewareSource.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

/**
 * The staging host serves the same archive as the live site. The header is the
 * only thing keeping it out of search results, and it fails silently — nothing
 * breaks, the pages simply get indexed — so it is worth asserting.
 */
describe('staging noindex', () => {
  it('is gated on runtime config, not a hard-coded hostname', () => {
    expect(middleware).toMatch(/useRuntimeConfig\(event\)\.noindex/)
    expect(middleware, 'a hostname in here means the next domain silently misses it')
      .not.toMatch(/purgatoryedit\.com|railway\.app/)
  })

  it('sends noindex AND nofollow', () => {
    // nofollow matters: without it a crawler still walks every archive link
    // from a page it was told not to index.
    expect(middleware).toMatch(/X-Robots-Tag/i)
    expect(middleware).toMatch(/noindex,\s*nofollow/)
  })

  it('defaults to indexable, so production needs no variable to be correct', () => {
    expect(nuxtConfig).toMatch(/noindex:\s*false,\s*\/\/ NUXT_NOINDEX/)
  })
})
