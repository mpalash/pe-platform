import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const compose = readFileSync(resolve(import.meta.dirname, '../docker-compose.yml'), 'utf8')

/**
 * Hard rule 2: `docker compose up` plus `pnpm dev` is the entire local setup.
 * These assertions guard the properties of that file that are easy to break by
 * accident and annoying to debug later.
 */
describe('local stack', () => {
  it('pins every image to an exact version', () => {
    const images = [...compose.matchAll(/^\s*image:\s*(\S+)$/gm)].map(m => m[1]!)

    expect(images.length).toBeGreaterThanOrEqual(3)
    for (const image of images) {
      expect(image, `${image} must be pinned`).not.toMatch(/:latest$/)
      expect(image, `${image} must carry an explicit tag`).toMatch(/:[^:]+$/)
      // A bare major like `postgres:17` still moves under you.
      expect(image, `${image} must pin a patch version`).toMatch(/:v?\d+\.\d+/)
    }
  })

  it('runs Postgres, Directus and Mailpit', () => {
    for (const service of ['postgres:', 'directus:', 'mailpit:']) {
      expect(compose).toContain(service)
    }
  })

  it('waits for Directus on /server/ping, not the permission-gated /server/health', () => {
    expect(compose).toContain('/server/ping')
    expect(compose).not.toMatch(/test:[\s\S]{0,400}\/server\/health/)
  })

  it('sends Directus mail to the Mailpit trap', () => {
    expect(compose).toContain('EMAIL_TRANSPORT: smtp')
    expect(compose).toContain('EMAIL_SMTP_HOST: mailpit')
  })

  it('gives every service a healthcheck so `up --wait` means ready', () => {
    // Scope to the services block — top-level `volumes:` entries sit at the
    // same indentation and would otherwise be counted as services.
    const servicesBlock = compose.slice(
      compose.indexOf('\nservices:'),
      compose.indexOf('\nvolumes:'),
    )

    const services = (servicesBlock.match(/^ {2}\w[\w-]*:$/gm) ?? []).length
    const healthchecks = (servicesBlock.match(/^ {4}healthcheck:$/gm) ?? []).length

    expect(services).toBe(3)
    expect(healthchecks).toBe(services)
  })
})
