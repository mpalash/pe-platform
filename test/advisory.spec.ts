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
const archivePage = read('app/pages/archive.vue')
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
    const scrim = code(modal).match(/<div\s+class="advisory-gate__scrim"[^>]*\/>/)

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
    expect(code(archivePage)).toMatch(/:inert="!advisory\.accepted\.value"/)
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
