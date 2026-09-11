/**
 * The archive's content warning.
 *
 * These guard properties that are ethical rather than cosmetic, and every one
 * of them fails silently: the gate still appears, still looks right, and no
 * longer does its job. That is the worst failure mode available here, so it is
 * worth a test each.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const repoRoot = resolve(import.meta.dirname, '..')

function read(path: string): string {
  return readFileSync(resolve(repoRoot, path), 'utf8')
}

/** Prose explains all of this at length; matching the prose is not a test. */
function code(source: string): string {
  return source
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
}

const modal = read('app/components/archive/ArchiveAdvisoryModal.vue')
/*
 * The gate lives in the shared browser, which BOTH the archive and the
 * experience logs render — the sessions are recordings of people watching
 * this same material, so they sit behind the same warning.
 */
const browser = read('app/components/archive/ArchiveBrowser.vue')
const BROWSER_PAGES = ['app/pages/archive.vue', 'app/pages/experience-logs.vue']
const activePlayer = read('app/composables/useActivePlayer.ts')

describe('the advisory cannot be dismissed by accident', () => {
  /**
   * A content warning you can escape out of has not been read. AuthModal
   * deliberately does the opposite; this must not inherit it by being copied.
   */
  it('does not close on Escape', () => {
    expect(code(modal)).not.toContain('Escape')
  })

  it('does not close when the scrim is clicked', () => {
    // The scrim carries no click handler at all — the only ways out are the
    // accept button and the decline link.
    //
    // Matched on the class list containing `advisory-gate__scrim` rather than
    // equalling it: the element also wears the shared `.scrim` class, and a
    // pattern pinned to one exact attribute value fails when a second class is
    // added, which looks like the handler assertion breaking.
    const scrim = code(modal).match(/<div[^>]*class="[^"]*advisory-gate__scrim[^"]*"[^>]*\/>/)

    expect(scrim, 'scrim element not found').toBeTruthy()
    expect(scrim![0]).not.toContain('@click')
  })
})

describe('nothing is reachable or playing behind the advisory', () => {
  /**
   * The blur handles the visual half only. Without `inert` the whole archive
   * stays in the tab order and the accessibility tree, so a keyboard or screen
   * reader user walks straight into the material the warning is about.
   */
  it('marks the archive inert until accepted', () => {
    expect(code(browser)).toMatch(/:inert="!advisory\.accepted\.value"/)
  })

  it('shows the advisory modal until accepted', () => {
    expect(code(browser)).toMatch(/<ArchiveAdvisoryModal v-if="!advisory\.accepted\.value"/)
  })

  /**
   * Both guarantees above live in ArchiveBrowser, so they hold for a page only
   * if that page renders it and nothing of its own. A page that grew its own
   * template around the browser — or instead of it — could show media with no
   * gate in front of it, and every test above would still pass.
   */
  it.each(BROWSER_PAGES)('%s renders the shared browser and nothing else', (path) => {
    const template = code(read(path)).match(/<template>([\s\S]*)<\/template>/)?.[1]?.trim()
    expect(template).toBe('<ArchiveBrowser />')
  })

  /**
   * Enforced in useActivePlayer rather than in the feed, so that any future
   * caller inherits it instead of having to remember.
   */
  it('refuses to start a clip until accepted', () => {
    expect(code(activePlayer)).toMatch(/if\s*\(!advisory\.accepted\.value\)\s*return/)
  })
})

describe('the advisory always says something', () => {
  /**
   * An archive of depicted violence with a blank warning over it is worse than
   * one with none, because the gate still appears and asks for consent to
   * nothing. Every field falls back to real copy, not a placeholder.
   */
  it('falls back to the real warning when Directus is empty', () => {
    const route = read('server/api/content/archive-advisory.get.ts')

    expect(code(route)).toMatch(/const FALLBACK: ArchiveAdvisory = \{/)

    for (const field of ['title', 'body', 'accept_label', 'decline_label', 'decline_path']) {
      expect(code(route), `${field} has no fallback`).toMatch(
        new RegExp(`${field}:[^\\n]*FALLBACK\\.${field}`),
      )
    }
  })
})

describe('each collection has its own warning', () => {
  const route = code(read('server/api/content/archive-advisory.get.ts'))

  it('selects the singleton from an allowlist, never from the request', () => {
    // The route reads with the service token; a caller naming an arbitrary
    // Directus collection would be reading whatever it liked.
    expect(route).toMatch(/archive: 'archive_advisory'/)
    expect(route).toMatch(/sessions: 'experience_logs_advisory'/)
    expect(route).toMatch(/if \(!singleton\) throw createError\(\{ statusCode: 400/)
    expect(route).not.toMatch(/readDirectusSingleton\(collection\)/)
  })

  it('asks for the warning of the collection the page shows', () => {
    expect(code(modal)).toMatch(/query: \{ collection: spec\.id \}/)
  })

  it('records acceptance per collection, so one warning does not dismiss the other', () => {
    expect(code(read('app/composables/useArchiveAdvisory.ts'))).toMatch(/`\$\{spec\.id\}:advisoryAccepted`/)
  })
})

describe('navigation', () => {
  it('names every application route in the seed and in the header fallback', () => {
    const seed = read('scripts/seed-settings.ts')
    const header = read('app/components/SiteHeader.vue')
    for (const path of ['/archive', '/experience-logs']) {
      expect(seed, `seed-settings lacks ${path}`).toContain(`path: '${path}'`)
      expect(header, `SiteHeader fallback lacks ${path}`).toContain(`to: '${path}'`)
    }
  })
})
