import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const repoRoot = resolve(import.meta.dirname, '..')

function styles(file: string): string {
  return readFileSync(resolve(repoRoot, 'app/assets/styles', file), 'utf8')
}

function withoutComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '')
}

const packageJson = JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf8')) as {
  dependencies: Record<string, string>
  devDependencies: Record<string, string>
}

describe('no CSS framework or component library', () => {
  /**
   * Phase 2 guardrail, and ADR territory. Styling is hand-written from tokens;
   * a framework's defaults would show through everything built on top.
   */
  const banned = [
    'tailwindcss', 'bootstrap', 'bulma', 'foundation-sites',
    'vuetify', 'primevue', 'quasar', 'element-plus', 'naive-ui',
    '@nuxt/ui', '@nuxtjs/tailwindcss', 'daisyui', 'unocss', '@unocss/nuxt',
  ]

  const installed = Object.keys({ ...packageJson.dependencies, ...packageJson.devDependencies })

  it.each(banned)('%s is not installed', (name) => {
    expect(installed).not.toContain(name)
  })
})

describe('reduced motion is honoured', () => {
  it('collapses every duration token', () => {
    const motion = styles('tokens.motion.css')
    const block = motion.match(/@media \(prefers-reduced-motion: reduce\)([\s\S]*)$/)?.[1] ?? ''

    for (const token of ['instant', 'quick', 'normal', 'slow']) {
      expect(block, `--duration-${token} not collapsed`).toContain(`--duration-${token}:`)
    }
  })

  it('also stops animation wholesale in the reset, for code that misses the tokens', () => {
    const reset = styles('reset.css')
    expect(reset).toMatch(/@media \(prefers-reduced-motion: reduce\)/)
    expect(reset).toMatch(/animation-duration:\s*1ms\s*!important/)
    expect(reset).toMatch(/transition-duration:\s*1ms\s*!important/)
  })

  it('does not leave smooth scrolling on for people who asked for less motion', () => {
    const reset = styles('reset.css')
    const reduced = reset.slice(reset.indexOf('prefers-reduced-motion'))
    expect(reduced).toMatch(/scroll-behavior:\s*auto/)
  })
})

describe('focus is never removed without a replacement', () => {
  const base = withoutComments(styles('base.css'))

  it('defines a visible :focus-visible indicator', () => {
    expect(base).toMatch(/:focus-visible\s*\{[^}]*outline:/)
  })

  it('only ever writes `outline: none` alongside :focus-visible handling', () => {
    // The single legitimate case is suppressing the default ring on :focus for
    // browsers that still paint one, deferring to the :focus-visible rule.
    const suppressions = [...base.matchAll(/([^{}]*)\{[^}]*outline:\s*none[^}]*\}/g)]
      .map(match => match[1]!.trim())

    for (const selector of suppressions) {
      expect(selector, `\`outline: none\` under "${selector}" has no :focus-visible guard`)
        .toMatch(/:focus:not\(:focus-visible\)/)
    }
  })

  it('ships a skip link that stays focusable while hidden', () => {
    // display:none or visibility:hidden would remove it from the tab order,
    // which is the usual way a skip link silently stops working.
    const skip = base.match(/\.skip-link\s*\{([^}]*)\}/)?.[1] ?? ''
    expect(skip).not.toBe('')
    expect(skip).not.toMatch(/display:\s*none/)
    expect(skip).not.toMatch(/visibility:\s*hidden/)
    expect(base).toMatch(/\.skip-link:focus-visible/)
  })
})

describe('typography decision is recorded', () => {
  it('says explicitly that fonts are not self-hosted, and why', () => {
    const type = styles('tokens.type.css')
    expect(type).toMatch(/FONTS ARE NOT SELF-HOSTED/)
    expect(type).toMatch(/system stack/i)
  })

  it('keeps a single measure token rather than scattering widths', () => {
    const type = withoutComments(styles('tokens.type.css'))
    expect(type).toMatch(/--measure:/)
  })
})

describe('layout primitives', () => {
  const primitives = withoutComments(styles('primitives.css'))

  it.each(['center', 'stack', 'cluster', 'grid', 'frame', 'bleed'])(
    '.%s exists',
    (name) => {
      expect(primitives).toMatch(new RegExp(`\\.${name}\\s*\\{`))
    },
  )

  it('Grid guards its track minimum against narrow viewports', () => {
    // Without min(), a --grid-min wider than the container overflows the page.
    expect(primitives).toMatch(/minmax\(min\(var\(--grid-min\), 100%\), 1fr\)/)
  })

  it('Center and prose have a definite width so Bleed cannot inflate them', () => {
    // Both are flex items in practice. `margin-inline: auto` on a flex item
    // disables cross-axis stretch, and a 100dvw Bleed child then sizes the
    // container from content — pushing the page sideways on phones.
    const center = primitives.match(/\.center\s*\{([^}]*)\}/)?.[1] ?? ''
    expect(center).toMatch(/inline-size:\s*100%/)

    const prose = withoutComments(styles('base.css')).match(/\.prose\s*\{([^}]*)\}/)?.[1] ?? ''
    expect(prose).toMatch(/inline-size:\s*100%/)
  })

  it('never puts a custom property inside a selector', () => {
    // `:nth-child(var(--x))` parses happily in dev and fails only when
    // lightningcss minifies the production build. Caught here in milliseconds
    // instead of at the end of a build.
    const selectors = primitives.replace(/\{[^}]*\}/g, '|')
    expect(selectors).not.toMatch(/var\(/)
  })

  it('body clips horizontal overflow so Bleed cannot cause a scrollbar', () => {
    // `clip`, not `hidden` — hidden creates a scroll container and breaks
    // position: sticky descendants.
    const reset = withoutComments(styles('reset.css'))
    expect(reset).toMatch(/overflow-x:\s*clip/)
    expect(reset).not.toMatch(/overflow-x:\s*hidden/)
  })
})
