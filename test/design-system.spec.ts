import { existsSync, readFileSync } from 'node:fs'
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

describe('block component naming', () => {
  /**
   * The mapping BlockRenderer uses, tested directly. It looks trivial and is
   * not: the obvious implementation produces `Blockrichtext` for single-word
   * blocks, and the failure mode is an entirely blank page with the content
   * sitting invisibly in HTML attributes.
   */
  function nameFor(collection: string): string {
    const stem = collection.replace(/^block_/, '')
    const pascal = stem
      .replace(/_(\w)/g, (_, char: string) => char.toUpperCase())
      .replace(/^(\w)/, (_, char: string) => char.toUpperCase())
    return `Block${pascal}`
  }

  it.each([
    ['block_richtext', 'BlockRichtext'],
    ['block_media', 'BlockMedia'],
    ['block_faq', 'BlockFaq'],
    ['block_logos', 'BlockLogos'],
    ['block_people', 'BlockPeople'],
    ['block_advisory', 'BlockAdvisory'],
    ['block_archive_ref', 'BlockArchiveRef'],
  ])('%s → %s', (collection, expected) => {
    expect(nameFor(collection)).toBe(expected)
  })

  it('every block collection in the model has a matching component file', () => {
    const model = readFileSync(resolve(repoRoot, 'scripts/directus-content-model.ts'), 'utf8')
    const blocks = [...model.matchAll(/ensureCollection\('(block_\w+)'/g)].map(m => m[1]!)

    expect(blocks.length).toBeGreaterThanOrEqual(6)

    for (const collection of blocks) {
      const file = resolve(repoRoot, `app/components/blocks/${nameFor(collection)}.vue`)
      expect(existsSync(file), `${collection} has no ${nameFor(collection)}.vue`).toBe(true)
    }
  })
})

describe('marquee', () => {
  const marquee = readFileSync(resolve(repoRoot, 'app/components/blocks/BlockMarquee.vue'), 'utf8')

  it('stops entirely under prefers-reduced-motion, rather than slowing down', () => {
    const reduced = marquee.slice(marquee.indexOf('prefers-reduced-motion'))
    expect(reduced).toMatch(/animation:\s*none/)
  })

  it('re-lays-out as a wrapping row so every credit stays readable', () => {
    const reduced = marquee.slice(marquee.indexOf('prefers-reduced-motion'))
    expect(reduced).toMatch(/flex-wrap:\s*wrap/)
    // The duplicate copies must go, or every name repeats down the page.
    expect(reduced).toMatch(/\[aria-hidden='true'\][\s\S]{0,80}display:\s*none/)
  })

  it('pauses on hover and on focus, so a name can be read or clicked', () => {
    expect(marquee).toMatch(/:hover[\s\S]{0,120}animation-play-state:\s*paused/)
    expect(marquee).toMatch(/focus-within/)
  })

  it('travels exactly one copy per cycle, whatever the copy count', () => {
    // A hard -50% only loops seamlessly with exactly two copies; the number of
    // copies is measured at runtime, so the keyframe has to divide by it.
    expect(marquee).toMatch(/translateX\(calc\(-100% \/ var\(--marquee-repeats/)
  })

  it('keeps duplicate copies out of the accessibility tree and the tab order', () => {
    expect(marquee).toMatch(/aria-hidden="true"/)
    expect(marquee).toMatch(/tabindex="-1"/)
  })
})

describe('the error page', () => {
  const errorPage = readFileSync(resolve(repoRoot, 'app/error.vue'), 'utf8')

  it('clears the error on every route away from it', () => {
    /*
     * A plain <NuxtLink> on an error page changes the URL but leaves the error
     * mounted, stranding the visitor on a 404 that follows them around. Every
     * exit has to go through clearError.
     */
    expect(errorPage).toMatch(/clearError/)

    // Comments stripped: the file explains why <NuxtLink> is wrong here, and
    // saying so is the opposite of doing it.
    const code = errorPage
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
      .replace(/<!--[\s\S]*?-->/g, '')

    expect(code).not.toMatch(/<NuxtLink/)
  })

  it('is not indexable', () => {
    expect(errorPage).toMatch(/robots:\s*'noindex'/)
  })
})

describe('auth', () => {
  const requestRoute = readFileSync(resolve(repoRoot, 'server/api/auth/request.post.ts'), 'utf8')
  const modal = readFileSync(resolve(repoRoot, 'app/components/AuthModal.vue'), 'utf8')

  it('has no passwords and no social identity provider (ADR-002)', () => {
    /*
     * pe-vue had email+password plus Google and Facebook OAuth. ADR-002 rules
     * out passwords entirely and rejects social sign-in as an external
     * dependency and an access barrier.
     *
     * Checked against CODE, not prose: the modal's own copy says "there is no
     * password to choose", and its comments name the providers it deliberately
     * does not use. Both are the opposite of a violation.
     */
    const code = (source: string) => source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
      .replace(/<template>[\s\S]*?<\/template>/g, '')

    // No password input anywhere, including the template.
    expect(modal).not.toMatch(/type="password"/)

    expect(code(modal).toLowerCase()).not.toMatch(/oauth|signinwithgoogle|facebook/)
    expect(code(requestRoute).toLowerCase()).not.toMatch(/password/)
  })

  it('rate limits by address and by IP', () => {
    // Otherwise the endpoint is an open mail relay, and magic-link mail is the
    // only way in — a burned sending domain locks out every user at once.
    expect(requestRoute).toMatch(/perAddress/)
    expect(requestRoute).toMatch(/perIp/)
    expect(requestRoute).toMatch(/statusCode: 429/)
  })

  it('answers identically whether or not the account exists', () => {
    // Otherwise it is an oracle for "does this person have an account here",
    // which for this archive is a disclosure that could matter.
    expect(requestRoute).toMatch(/ACCEPTED/)
  })

  it('never trusts a client-supplied identity', () => {
    const session = readFileSync(resolve(repoRoot, 'server/api/auth/session.get.ts'), 'utf8')
    // Hard rule 6: identity comes from the cookie, server-side.
    expect(session).toMatch(/getCookie/)
    expect(session).not.toMatch(/readBody/)
  })

  it('burns the login token before minting a session', () => {
    const store = readFileSync(resolve(repoRoot, 'server/utils/auth-store.ts'), 'utf8')

    /*
     * The ORDER is the property worth testing, not the field name — this used
     * to pin `usedAt` and broke when the store moved to Directus and the column
     * became `used_at`, while the behaviour was unchanged. What must hold is
     * that consumeLoginToken marks the token used before it returns ok, so a
     * replayed link cannot mint a second session.
     */
    const consume = store.slice(
      store.indexOf('export async function consumeLoginToken'),
      store.indexOf('export async function createSession'),
    )

    expect(consume, 'consumeLoginToken not found').not.toBe('')
    expect(consume).toMatch(/used_?at:/i)
    expect(consume.indexOf('used_at:')).toBeLessThan(consume.indexOf('return { ok: true'))

    // Stored hashed, never in the clear.
    expect(store).toMatch(/createHash\('sha256'\)/)
  })

  /**
   * The whole point of moving off the filesystem: a redeploy must not sign
   * everyone out, and two instances must see the same sessions.
   */
  it('keeps sessions in Directus rather than on the filesystem', () => {
    const store = readFileSync(resolve(repoRoot, 'server/utils/auth-store.ts'), 'utf8')

    expect(store).not.toMatch(/useStorage\(/)
    expect(store).toMatch(/auth_sessions/)
    expect(store).toMatch(/auth_login_tokens/)
  })
})

describe('the archive modal', () => {
  const modal = readFileSync(
    resolve(repoRoot, 'app/components/archive/ArchiveModalPlayer.vue'), 'utf8',
  )

  it('is a labelled dialog', () => {
    expect(modal).toMatch(/role="dialog"/)
    expect(modal).toMatch(/aria-modal="true"/)
  })

  it('closes on Escape and traps Tab', () => {
    expect(modal).toMatch(/event\.key === 'Escape'/)
    expect(modal).toMatch(/event\.key !== 'Tab'/)
  })

  it('restores focus to whatever opened it', () => {
    expect(modal).toMatch(/previouslyFocused/)
  })

  it('does not pull in video.js', () => {
    const pkg = JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>
    }
    expect(Object.keys(pkg.dependencies)).not.toContain('video.js')
    expect(Object.keys(pkg.dependencies)).not.toContain('@videojs-player/vue')
  })
})

describe('the galaxy', () => {
  const galaxy = readFileSync(
    resolve(repoRoot, 'app/components/archive/ArchiveGalaxy.vue'), 'utf8',
  )

  it('refreshes the camera matrix before projecting for a pick', () => {
    /*
     * `Vector3.project` reads camera.matrixWorldInverse, which three only
     * refreshes inside renderer.render(). Picking runs between frames, so
     * without this every tile projects outside the frustum and the galaxy is
     * silently unclickable.
     */
    const pickFn = galaxy.slice(galaxy.indexOf('function pick('))
    expect(pickFn).toMatch(/camera\.updateMatrixWorld\(\)/)
  })

  it('disposes its WebGL resources on unmount', () => {
    // Contexts are not garbage collected; leaking one per view switch exhausts
    // the browser's limit within a few toggles.
    expect(galaxy).toMatch(/renderer\?\.dispose\(\)/)
    expect(galaxy).toMatch(/atlasTexture\?\.dispose\(\)/)
  })

  it('is operable from the keyboard, not just the mouse', () => {
    expect(galaxy).toMatch(/ArrowLeft/)
    expect(galaxy).toMatch(/tabindex="0"/)
  })
})

describe('the modal steps to the next clip', () => {
  const modal = readFileSync(
    resolve(repoRoot, 'app/components/archive/ArchiveModalPlayer.vue'), 'utf8',
  )

  it('derives the source reactively rather than once at setup', () => {
    /*
     * `usePlaybackSource` returns plain strings. Destructuring it at setup gives
     * a `src` that never changes, so stepping to the next clip updated the title
     * and description while the <video> kept playing the first one — it looked
     * like the metadata was broken when it was the video that never moved.
     */
    expect(modal).toMatch(/const source = computed\(\(\) => usePlaybackSource/)
    expect(modal).not.toMatch(/const \{ src, poster \} = usePlaybackSource/)
  })

  it('connects the clip it OPENS on, not only the ones stepped to', () => {
    // An immediate watcher's first run is synchronous, in setup, before the
    // <video> exists — `flush: 'post'` does not delay it. The modal used to
    // start that way, so every clip opened from the grid or the galaxy sat on
    // its poster with no source attached. The first start is onMounted's.
    expect(modal).toMatch(/onMounted\(start\)/)
    expect(modal.slice(modal.indexOf('watch(src,'))).not.toMatch(/^[^\n]*immediate: true/)
  })

  it('reconnects and reloads the element when the clip changes', () => {
    // Swapping `src` on an element that is already playing does not reliably
    // re-fetch; the browser keeps decoding the old stream until told otherwise.
    // The modal watches its source and hands it to useVideoSource, whose
    // native path is where the `load()` now lives — so it applies to every
    // player, and to streams as well as clips.
    const start = modal.slice(modal.indexOf('async function start()'))
    expect(start).toMatch(/await playback\.ensure\(\)/)
    expect(modal).toMatch(/watch\(src, start, \{ flush: 'post' \}\)/)

    const seam = readFileSync(resolve(repoRoot, 'app/composables/usePlaybackSource.ts'), 'utf8')
    expect(seam).toMatch(/video\.src = src\s*\n[\s\S]{0,600}?video\.load\(\)/)
  })
})

describe('modal scrims', () => {
  /**
   * The blur and its @supports fallback live in one place (`.scrim` in
   * primitives.css) because the copy that forgets the fallback degrades to a
   * see-through overlay on exactly the browsers that need help most — and a
   * modal you can read straight through is not a modal.
   *
   * So: anything named like a scrim must actually be wearing the shared class.
   */
  const MODALS = [
    'app/components/AuthModal.vue',
    'app/components/archive/ArchiveModalPlayer.vue',
    'app/components/archive/ArchiveAdvisoryModal.vue',
  ]

  for (const path of MODALS) {
    it(`${path.split('/').pop()} uses the shared scrim`, () => {
      const source = readFileSync(resolve(repoRoot, path), 'utf8')
      const scrimClass = source.match(/class="[^"]*__scrim[^"]*"/)

      expect(scrimClass, 'no scrim element found').toBeTruthy()
      expect(scrimClass![0]).toContain(' scrim"')
    })
  }

  /**
   * Both scrim values are shared, and neither is tunable per modal.
   *
   * Modals picking their own read as different surfaces, and the values drift
   * every time one of them is edited. A modal backdrop is a property of the
   * design system, so it is declared once.
   */
  for (const property of ['--scrim-opacity', '--scrim-blur']) {
    it(`sets ${property} in exactly one place`, () => {
      const pattern = new RegExp(`${property}\\s*:`, 'g')

      const overriding = MODALS
        .filter(path => pattern.test(readFileSync(resolve(repoRoot, path), 'utf8')))

      expect(overriding, `overriding the shared ${property}`).toHaveLength(0)

      const css = readFileSync(resolve(repoRoot, 'app/assets/styles/primitives.css'), 'utf8')

      expect(css.match(pattern)).toHaveLength(1)
    })
  }

  it('the shared scrim blurs and has a fallback for browsers that cannot', () => {
    const css = readFileSync(resolve(repoRoot, 'app/assets/styles/primitives.css'), 'utf8')

    expect(css).toMatch(/\.scrim \{[\s\S]*?backdrop-filter: blur\(var\(--scrim-blur\)\)/)
    expect(css).toMatch(/@supports not \(backdrop-filter: blur\(1px\)\)/)
  })
})

describe('elevation', () => {
  const tokens = styles('tokens.elevation.css')
  const primitives = styles('primitives.css')

  function component(path: string): string {
    return readFileSync(resolve(repoRoot, path), 'utf8')
  }

  /**
   * The assignment from the four-step scale to the things that use it. It is
   * the entire content of the system — the values themselves are just numbers,
   * and what makes them a scale is that each level means one thing.
   */
  const ASSIGNMENT: Array<[level: number, path: string]> = [
    [1, 'app/assets/styles/primitives.css'], // .content-page
    [2, 'app/components/SiteHeader.vue'],
    [2, 'app/components/archive/ArchiveToolbar.vue'],
    [3, 'app/components/AmbientVideo.vue'],
    [4, 'app/components/AuthModal.vue'],
    [4, 'app/components/archive/ArchiveModalPlayer.vue'],
    [4, 'app/components/archive/ArchiveAdvisoryModal.vue'],
  ]

  const FROSTED = ASSIGNMENT.map(([, path]) => path).filter(path => path.endsWith('.vue'))

  it('defines four steps and no more', () => {
    const defined = [...withoutComments(tokens).matchAll(/--shadow-(\d+)\s*:/g)]
      .map(match => Number(match[1]))

    expect(defined).toEqual([1, 2, 3, 4])
  })

  it('gets darker and wider at every step', () => {
    // A "scale" whose steps are not ordered is four arbitrary shadows. The
    // blur radius of the ambient (second) layer is the one that carries the
    // sense of height, so that is what has to climb.
    const blurs = [1, 2, 3, 4].map((level) => {
      const value = tokens.match(new RegExp(`--shadow-${level}:([^;]*);`))?.[1] ?? ''
      const radii = [...value.matchAll(/0 \d+px (\d+)px/g)].map(m => Number(m[1]))
      expect(radii, `--shadow-${level} is not two layers`).toHaveLength(2)
      return radii[1]!
    })

    for (let i = 1; i < blurs.length; i++) {
      expect(blurs[i], `--shadow-${i + 1} is not softer than --shadow-${i}`)
        .toBeGreaterThan(blurs[i - 1]!)
    }
  })

  it.each(ASSIGNMENT)('level %i is claimed by %s', (level, path) => {
    expect(component(path)).toContain(`--elevation: var(--shadow-${level})`)
  })

  it.each(FROSTED)('%s wears the shared .frosted class', (path) => {
    expect(component(path)).toMatch(/class="[^"]*\bfrosted\b/)
  })

  it('nothing writes its own box-shadow', () => {
    // The whole point of a fixed scale: a fifth depth appearing inline is how
    // it stops meaning anything. `.frosted` is the only consumer.
    const shadows = [...withoutComments(primitives).matchAll(/box-shadow:([^;]*);/g)]
      .map(match => match[1]!.trim())

    expect(shadows).toEqual(['var(--elevation)'])

    for (const path of FROSTED) {
      expect(component(path), `${path} writes its own box-shadow`)
        .not.toMatch(/box-shadow:/)
    }
  })

  it('frosts at the same radius as the scrim', () => {
    // Two blurs stacked at different radii read as two unrelated materials,
    // which is the one thing frosted glass must not do.
    const frost = withoutComments(tokens).match(/--frost-blur:\s*([^;]+);/)?.[1]?.trim()
    const scrim = withoutComments(primitives).match(/--scrim-blur:\s*([^;]+);/)?.[1]?.trim()

    expect(frost).toBe(scrim)
  })

  it('degrades to an opaque surface where backdrop-filter is missing', () => {
    // Translucent glass over unblurred video is unreadable in a way the opaque
    // fallback never is. Same guarantee the scrim already makes.
    const block = primitives.match(
      /@supports not \(backdrop-filter: blur\(1px\)\) \{([\s\S]*?)\n\}/g,
    )?.join('\n') ?? ''

    expect(block).toContain('.frosted')
  })

  it('the ambient player is the only frosted surface without a border', () => {
    // It is a video player, and its <video> is masked to an irregular shape —
    // a 1px rectangle around it draws the frame the mask exists to avoid.
    expect(component('app/components/AmbientVideo.vue')).toMatch(/\.ambient \{[\s\S]*?border: 0;/)

    for (const path of FROSTED.filter(p => !p.endsWith('AmbientVideo.vue'))) {
      expect(component(path), `${path} suppresses the shared border`)
        .not.toMatch(/border:\s*(0|none)\s*;/)
    }
  })
})
