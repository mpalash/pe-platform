import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const compose = readFileSync(resolve(import.meta.dirname, '../docker-compose.yml'), 'utf8')
const envExample = readFileSync(resolve(import.meta.dirname, '../.env.example'), 'utf8')

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

/**
 * Directus file storage. The S3 location exists in the compose file but must
 * stay switched off by default — hard rule 2 says a fresh clone plus
 * `docker compose up` is a complete environment with no cloud account.
 */
describe('file storage', () => {
  it('defaults to the local driver, so no AWS account is needed to run the stack', () => {
    expect(compose).toContain('STORAGE_LOCATIONS: ${DIRECTUS_STORAGE_LOCATIONS:-local}')
    expect(envExample).toMatch(/^DIRECTUS_STORAGE_LOCATIONS=local$/m)
  })

  it('keeps `local` reachable in any documented multi-location value', () => {
    // Files carry their location in directus_files.storage forever. A value
    // that drops `local` orphans every file uploaded before the switch.
    const documented = [...envExample.matchAll(/DIRECTUS_STORAGE_LOCATIONS=(\S+)/g)].map(m => m[1]!)

    expect(documented.length).toBeGreaterThan(0)
    for (const value of documented) {
      expect(value.split(','), `${value} drops the local location`).toContain('local')
    }
  })

  it('reads every S3 credential from the environment rather than hard-coding one', () => {
    for (const key of ['STORAGE_S3_KEY', 'STORAGE_S3_SECRET', 'STORAGE_S3_BUCKET']) {
      expect(compose).toMatch(new RegExp(`${key}: \\$\\{`))
    }

    // AKIA/ASIA prefixes are what a pasted AWS access key looks like.
    const looksLikeAKey = /A[KS]IA[0-9A-Z]{16}/
    expect(compose, 'docker-compose.yml holds an AWS key').not.toMatch(looksLikeAKey)
    expect(envExample, '.env.example holds an AWS key').not.toMatch(looksLikeAKey)

    expect(envExample).toMatch(/^AWS_ASSETS_ACCESS_KEY_ID=$/m)
    expect(envExample).toMatch(/^AWS_ASSETS_SECRET_ACCESS_KEY=$/m)
  })

  it('does not set an ACL — the bucket stays private and Directus serves the file', () => {
    // Hard rule 4 is about the archive being public without gating. This is the
    // other bucket: a public-read ACL here would expose editor uploads at their
    // S3 URL, bypassing /assets/ and its transforms.
    expect(compose).not.toContain('STORAGE_S3_ACL')
  })
})
