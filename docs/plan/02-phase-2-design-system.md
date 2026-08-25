# Phase 2 — Design system & layout

> **Blocked by:** Phase 1.
> **Blocks:** Phases 3 and 4 — both consume these primitives.
> **Size:** ~1 week.

---

## Goal

A small, hand-written set of design tokens and layout primitives that everything else is
built from. No framework, no component library, no ported CSS.

---

## The brief, and what it implies

The platform is **experimental and artistic**. That is a design constraint with real
engineering consequences:

- A utility framework's defaults — its spacing scale, its shadows, its rounded corners, its
  particular idea of a card — will show through whatever you put on top. On a site whose
  character *is* the point, that is the wrong starting position.
- Content will be **structurally unusual**. Phase 4 builds a block system where editors
  compose pages freely. The layout primitives have to accommodate arrangements nobody has
  drawn yet.

So: build a **small** system of tokens and primitives, not a comprehensive component library.
Comprehensive systems ossify, and this project needs to stay loose.

**Resist building components speculatively.** Build the primitives, then build components
when Phases 3 and 4 demand them. A design system with forty unused components is a liability.

---

## Steps

### 2.1 — Tokens

Hand-written CSS custom properties in `app/assets/styles/`. One file per concern.

**Colour.** Define semantic tokens (`--surface`, `--ink`, `--accent`), not literal ones
(`--grey-400`). Semantic naming is what makes a later palette change a one-file edit.

Check contrast as you pick, not afterwards. Body text needs 4.5:1, large text 3:1. On an
artistic site the temptation toward low-contrast type is strong and worth resisting —
retrofitting contrast means revisiting every decision that depended on it.

**Type.** Choose a scale and commit.

- If self-hosting fonts: subset them, `woff2`, `font-display: swap`, preload the faces that
  render above the fold. Self-hosting keeps the dependency budget at zero and avoids a
  third-party request on every page.
- Set a comfortable measure (~60–75 characters) for long-form content. Editorial pages will
  carry real prose.
- Fluid type with `clamp()` is worth it here — it removes a whole class of breakpoint work.

**Space.** One scale, used everywhere. Consistency in spacing does more for coherence than
almost anything else.

**Motion.** Define durations and easings as tokens. **Honour `prefers-reduced-motion`** from
the first animation, not as a later pass.

### 2.2 — Reset and base

A modern reset. `box-sizing: border-box`, sensible media defaults, no arbitrary margin
removal that you then fight.

Base element styles for everything editorial content will produce: headings, paragraphs,
lists, blockquote, `<figure>`/`<figcaption>`, tables, code. **Phase 4's rich-text blocks will
emit these**, and if the base styles are right, rich text needs almost no block-specific CSS.

### 2.3 — Layout primitives

A handful of composable primitives, not a grid framework:

| Primitive | Job |
|---|---|
| **Stack** | Vertical rhythm — consistent spacing between siblings |
| **Cluster** | Horizontal grouping that wraps |
| **Grid** | Responsive columns without media queries (`auto-fit` / `minmax`) |
| **Frame** | Aspect-ratio container — essential for the archive |
| **Bleed / Full** | Escape the content measure for full-width media |
| **Center** | Constrain to measure |

These compose to cover most layouts. `Bleed` matters more than it looks: an artistic archive
will want full-bleed media inside otherwise-constrained prose, and retrofitting that means
restructuring the page wrapper.

### 2.4 — Focus and keyboard baseline

Hard rule 11. Do this **now**, in the base styles, where it costs nothing:

- A visible, designed focus indicator. Use `:focus-visible` so it appears for keyboard users
  without cluttering mouse interaction. **Never `outline: none` without a replacement.**
- Ensure the focus style has contrast against every surface token.
- A skip link.
- Establish that every interactive element is a real button or link, not a `<div>` with a
  click handler.

Building this into the base is the difference between accessibility being free and being a
retrofit across every component.

### 2.5 — Dark mode — decide now

Decide explicitly whether the site is light, dark, or responsive to preference. Any of those
is fine; **discovering the question in Phase 4 is not**, because the answer changes how colour
tokens are structured.

If responsive: define the full light palette on `:root`, redefine only the tokens inside
`@media (prefers-color-scheme: dark)`. Never let a colour's only definition live inside a
media query.

If committing to one look: say so in a comment at the top of the colour file, so nobody
later assumes tokens are theme-ready when they are not.

### 2.6 — A working reference page

One route rendering every token and primitive: type scale, colours with contrast ratios,
spacing, focus states, layout primitives, and base element styles under realistic prose.

This is the artefact Phases 3 and 4 build against, and the thing to look at when deciding
whether the system holds together. Keep it in the repo — it is also how you review a change
to a token without opening the whole site.

### 2.7 — Site chrome

Header, footer, and navigation. Enough to sit around real pages.

Keep it minimal. Navigation depends on the content hierarchy that Phase 4 designs, so build
something honest and provisional and expect to revise it. Do not build a mega-menu against
imagined content.

---

## Acceptance criteria

- [ ] Reference page renders every token and primitive.
- [ ] All text/background token pairs meet WCAG AA. Checked with a tool, ratios recorded on
      the reference page.
- [ ] Keyboard-only pass through the reference page and site chrome: every interactive element
      reachable, focus always visible, focus order sensible, skip link works.
- [ ] `prefers-reduced-motion` honoured by every animation that exists.
- [ ] Base element styles handle a realistic long-form prose sample — nested lists,
      blockquotes, figures with captions, a table — with no additional CSS.
- [ ] Dark-mode decision made and documented in the colour file.
- [ ] No CSS framework, component library, or utility framework in `package.json`.
- [ ] Fonts self-hosted and subset, or a deliberate documented decision not to.
- [ ] Layout primitives compose: demonstrate full-bleed media inside constrained prose.

---

## Guardrails — out of scope for Phase 2

- **No CSS framework. No component library.** Tailwind, Vuetify, PrimeVue, Nuxt UI — none.
  ADR territory; the brief is styling from scratch.
- **Do not build content-block components.** Phase 4 builds those, from these primitives.
- **Do not style the archive player.** Phase 3.
- **Do not build speculative components.** Primitives only. Components arrive when a real
  screen needs them.
- **Do not add an icon library** until something needs an icon. Then take the few needed as
  inline SVG rather than a package.
- **Do not build a Storybook.** The reference page covers it at this scale, at a fraction of
  the maintenance.

---

## Record before closing — completed 2026-08-25

- **Dark mode decision: DARK ONLY.** Not responsive to `prefers-color-scheme`. Recorded in a
  banner comment at the top of `tokens.colour.css` so nobody later assumes the tokens are
  theme-ready — they are not, and adding a light palette means revisiting every value.
  `test/contrast.spec.ts` asserts no `@media (prefers-color-scheme)` rule creeps in.

- **Typefaces and licensing: none — a system stack, deliberately.** Recorded in a banner
  comment in `tokens.type.css`. Type is the largest single character decision on this site,
  and it is being made once real content exists rather than against placeholder prose. The
  cost of deferring is one token change (`--font-body`, `--font-display`); nothing else in
  the system depends on the family. When real faces are chosen: subset, woff2, self-hosted,
  `font-display: swap`, preload above the fold.

- **Register: austere editorial.** Near-monochrome, one warm accent (`--accent`, the only
  warm value in the system), generous whitespace, media does the talking.

- **Deliberately left undecided until real content exists:** the typefaces above; navigation
  structure (the header is honest and provisional — real hierarchy is a Phase 4 output); and
  every component beyond the single `.button` on the reference page. Primitives only, per the
  guardrail.

### Measured contrast

All nine text/surface pairs clear WCAG AA, worst case 5.31:1. The reference page computes
these live from the resolved cascade; `test/contrast.spec.ts` asserts the same pairs in CI,
reading values straight from the stylesheet so the numbers cannot drift.

| | `--surface` | `--surface-raised` | `--surface-sunken` |
|---|---|---|---|
| `--ink` | 16.78 | 15.68 | 17.28 |
| `--ink-muted` | 8.25 | 7.71 | 8.49 |
| `--ink-faint` | 5.68 | 5.31 | 5.84 |
| `--accent` | 10.60 | 9.90 | 10.91 |

### Three bugs the reference page caught

Worth recording, because all three pass a casual look and fail in production:

1. **`.center` overflowed the viewport by one gutter on phones.** The standard `box-sizing:
   content-box` Center recipe misbehaves when the element is a flex item — which every Center
   inside a Stack is. Now `border-box` with the gutters folded into `max-inline-size`.

2. **`margin-inline: auto` on `.prose` switched off cross-axis stretch**, so its width came
   from content — and a `100dvw` `.bleed` child then inflated the whole container past the
   viewport. Fixed with a definite `inline-size: 100%`. Full-bleed media inside constrained
   prose now lands at exactly 0 → viewport width at 360, 390, 768, 1024 and 1440.

3. **`:nth-child(var(--stack-split, 1))` is invalid CSS.** Custom properties are not permitted
   in selectors. It parsed fine in dev and failed only when lightningcss minified the
   production build. There is now a test for it.

### Verified

- Keyboard pass through the reference page: skip link is the first stop, appears on focus,
  and moves focus to `<main>`; focus order is skip → header → content; every control shows a
  visible ring. The one `outline: none` is on `<main>` — a skip target, not a control — and
  is commented as such.
- No horizontal overflow at 360, 390, 768, 1024, 1440.
- `pnpm lint`, `pnpm typecheck`, 83 tests, and `pnpm build` all pass.
