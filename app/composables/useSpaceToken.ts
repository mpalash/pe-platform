/**
 * Resolves a primitive's `space` prop.
 *
 * Accepts either a token step (`m`, `2xl`) or a raw CSS length (`2.5rem`,
 * `var(--space-l)`). Token steps are the normal case; raw lengths exist for the
 * rare layout that genuinely needs a value off the scale — and being explicit
 * about that is better than quietly adding a second scale.
 */
export function resolveSpace(space: string): string {
  const first = space[0] ?? ''

  // A leading digit, dot, or `var(`/`calc(` means it is already a CSS value.
  if (/[\d.]/.test(first) || space.startsWith('var(') || space.startsWith('calc(')) {
    return space
  }

  return `var(--space-${space})`
}
