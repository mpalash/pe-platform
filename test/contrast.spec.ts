import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { contrastRatio, gradeContrast, parseColour } from '../shared/utils/contrast'

/**
 * Phase 2 acceptance: "All text/background token pairs meet WCAG AA. Checked
 * with a tool."
 *
 * This is that tool, and it runs in CI. The reference page shows the same
 * numbers computed live in the browser; this file is what stops a token edit
 * from quietly dropping a pair below threshold.
 *
 * Values are read from the stylesheet rather than duplicated here — a copy would
 * be one more thing to keep in sync, and the first thing to go stale.
 */

const colourTokens = readFileSync(
  resolve(import.meta.dirname, '../app/assets/styles/tokens.colour.css'),
  'utf8',
)

function token(name: string): string {
  const match = colourTokens.match(new RegExp(`^\\s*--${name}:\\s*([^;]+);`, 'm'))
  if (!match) throw new Error(`Token --${name} not found in tokens.colour.css`)
  return match[1]!.trim()
}

const surfaces = ['surface', 'surface-raised', 'surface-sunken'] as const
const textInks = ['ink', 'ink-muted', 'ink-faint'] as const

describe('colour tokens parse', () => {
  it.each([...surfaces, ...textInks, 'accent', 'ink-inverse', 'rule', 'rule-strong'])(
    '--%s is a colour this checker understands',
    (name) => {
      expect(parseColour(token(name)), `--${name} = ${token(name)}`).not.toBeNull()
    },
  )
})

describe('every text ink meets WCAG AA on every surface', () => {
  const pairs = textInks.flatMap(ink => surfaces.map(surface => [ink, surface] as const))

  it.each(pairs)('--%s on --%s', (ink, surface) => {
    const ratio = contrastRatio(token(ink), token(surface))

    expect(ratio).not.toBeNull()
    // 4.5:1 is the AA threshold for normal body text. These tokens are all used
    // for body-sized text somewhere, so none of them gets the large-text pass.
    expect(ratio!, `${ratio?.toFixed(2)}:1 — needs 4.5:1`).toBeGreaterThanOrEqual(4.5)
  })
})

describe('accent', () => {
  it.each(surfaces)('is readable as link text on --%s', (surface) => {
    const ratio = contrastRatio(token('accent'), token(surface))!
    expect(ratio, `${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5)
  })

  it('is a usable focus indicator — 3:1 against every surface', () => {
    for (const surface of surfaces) {
      const ratio = contrastRatio(token('accent'), token(surface))!
      expect(ratio, `focus ring on --${surface}: ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(3)
    }
  })

  it('carries legible inverse text when used as a background', () => {
    // The skip link is exactly this: --ink-inverse on --accent.
    const ratio = contrastRatio(token('ink-inverse'), token('accent'))!
    expect(ratio, `${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5)
  })
})

describe('data series', () => {
  const series = [1, 2, 3, 4, 5, 6].map(n => `series-${n}`)

  // Each series colour is also its legend label's text colour, so it is held
  // to the text threshold, not the 3:1 for graphics.
  it.each(series.flatMap(name => surfaces.map(surface => [name, surface] as const)))(
    '--%s is readable as text on --%s',
    (name, surface) => {
      const ratio = contrastRatio(token(name), token(surface))!
      expect(ratio, `${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5)
    },
  )

  it('never borrows the accent, which is reserved for signal', () => {
    for (const name of series) expect(token(name).toLowerCase()).not.toBe(token('accent').toLowerCase())
  })
})

describe('the grading helper agrees with the WCAG thresholds', () => {
  it.each([
    [21, false, 'AAA'],
    [7, false, 'AAA'],
    [4.5, false, 'AA'],
    [3, false, 'AA Large'],
    [2.9, false, 'Fail'],
    [3, true, 'AA'],
    [2.9, true, 'Fail'],
  ])('%s:1 (large: %s) grades %s', (ratio, large, expected) => {
    expect(gradeContrast(ratio as number, large as boolean)).toBe(expected)
  })
})

describe('the dark-only decision is recorded where someone will find it', () => {
  it('says so at the top of the colour file', () => {
    expect(colourTokens).toMatch(/DARK ONLY/)
  })

  it('has no light palette hiding in a media query', () => {
    // Comments stripped — the file *mentions* prefers-color-scheme to say it
    // deliberately does not use it, which is the opposite of a violation.
    const rules = colourTokens.replace(/\/\*[\s\S]*?\*\//g, '')
    expect(rules).not.toMatch(/@media[^{]*prefers-color-scheme/)
  })
})
