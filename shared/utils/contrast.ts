/**
 * WCAG relative-luminance contrast, computed from the tokens as the browser
 * actually resolves them.
 *
 * The reference page reads real values out of the cascade rather than repeating
 * numbers written by hand, so the ratios it prints cannot drift from the tokens
 * they describe. test/contrast.spec.ts asserts the same pairs at build time.
 *
 * Lives in shared/ rather than app/composables/ because the test suite imports
 * it directly, and shared/ is the one place both the app and plain Node reach.
 */

function channel(value: number): number {
  const c = value / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

/** Accepts `#rgb`, `#rrggbb`, or `rgb(r g b)` / `rgb(r, g, b)`. */
export function parseColour(input: string): [number, number, number] | null {
  const value = input.trim()

  const hex = value.match(/^#([\da-f]{3}|[\da-f]{6})$/i)
  if (hex) {
    let digits = hex[1]!
    if (digits.length === 3) digits = digits.split('').map(d => d + d).join('')
    return [
      Number.parseInt(digits.slice(0, 2), 16),
      Number.parseInt(digits.slice(2, 4), 16),
      Number.parseInt(digits.slice(4, 6), 16),
    ]
  }

  const rgb = value.match(/^rgba?\(([^)]+)\)$/i)
  if (rgb) {
    const parts = rgb[1]!.split(/[\s,/]+/).filter(Boolean).slice(0, 3).map(Number)
    if (parts.length === 3 && parts.every(n => Number.isFinite(n))) {
      return parts as [number, number, number]
    }
  }

  return null
}

export function luminance(colour: string): number | null {
  const rgb = parseColour(colour)
  if (!rgb) return null

  const [r, g, b] = rgb
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

export function contrastRatio(foreground: string, background: string): number | null {
  const a = luminance(foreground)
  const b = luminance(background)
  if (a === null || b === null) return null

  const lighter = Math.max(a, b)
  const darker = Math.min(a, b)

  return (lighter + 0.05) / (darker + 0.05)
}

export type ContrastGrade = 'AAA' | 'AA' | 'AA Large' | 'Fail'

/** Grades against normal body text unless `large` is set (18.66px bold / 24px). */
export function gradeContrast(ratio: number, large = false): ContrastGrade {
  if (large) {
    if (ratio >= 4.5) return 'AAA'
    if (ratio >= 3) return 'AA'
    return 'Fail'
  }

  if (ratio >= 7) return 'AAA'
  if (ratio >= 4.5) return 'AA'
  if (ratio >= 3) return 'AA Large'
  return 'Fail'
}
