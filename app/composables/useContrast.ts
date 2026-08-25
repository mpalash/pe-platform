/**
 * The browser half of the contrast tooling.
 *
 * The maths lives in `shared/utils/contrast.ts`, which the test suite imports
 * directly. This file holds the one piece that genuinely needs a DOM, and
 * therefore cannot live in `shared/` — that project is compiled without the DOM
 * lib because server code shares it.
 */

/** Reads a custom property off :root as the browser resolved it. */
export function readToken(name: string): string {
  if (import.meta.server) return ''
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}
