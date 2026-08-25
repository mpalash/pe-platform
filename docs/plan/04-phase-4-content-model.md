# Phase 4 — Content model & block system

> **Blocked by:** Phases 1 and 2.
> **Can run in parallel with:** Phase 3.
> **Size:** 1–2 weeks.

---

## Goal

A page/block content model in Directus that can express the site's editorial content, rendered
by Nuxt from Phase 2 primitives, with Live Preview working — and ready for non-technical
editors to be introduced once the content design settles.

---

## The sequencing decision

Editors come **after** the content design is in place. That is the right call, and it changes
how this phase runs.

It means Phase 4 is a **design exercise conducted in a CMS**, not a CMS configuration task.
You are deciding what kinds of page this site can express, and the block schema is the record
of that decision. Get it right and editors inherit something coherent. Get it wrong and they
inherit a set of arbitrary constraints they will route around with `block_raw` forever.

It also means there is no editor to catch mistakes. The substitute is **building real pages**
— not lorem ipsum, actual intended content — and looking hard at the result.

---

## Steps

### 4.1 — Decide what kinds of page exist, before touching the CMS

On paper, away from the schema. What page types does this site need? An about page, a work
page, an index, an essay, a listing? What does each actually consist of?

Then: what is the **smallest set of blocks** that composes all of them?

Two failure modes to avoid, in both directions:

- **Too few blocks** → editors fight the system, and every page needs a developer.
- **Too many blocks** → editors face forty options, most pages use the wrong one, and
  consistency collapses.

Aim for something like **six to ten** block types. Every one should be justifiable by pointing
at a real intended page.

### 4.1 — OUTCOME (recorded 2026-08-25)

Derived from the real content in `pe-vue/src/md/` — about, research, faqs, disclaimers, home,
performance. Roughly 5,250 words of intended copy, not placeholder.

**The site is *purgatory* EDIT**: a montage-based VR experience and cinematic installation
built on the Doomscroll Archive — 30,000+ clips excerpted from 800 source files, close to
2,000 hours of video.

#### Page types

| Type | Real example | Shape |
|---|---|---|
| **Landing** | home | Short lede, then grouped supporter logos |
| **Editorial** | about, research | Long-form, deeply sectioned, in-page anchors, pull quotes, people lists |
| **Reference** | faqs | Grouped question/answer pairs, in-page anchors |
| **Legal / advisory** | disclaimers | Sectioned prose plus a very large content advisory |
| **Event** | performance | Hero video, then a calendar — the Phase 6 booking surface |

`about.md` is the structurally awkward one: six top-level sections, an authored table of
contents, a long block quotation, a team list with roles and external links, and a separate
institutional-collaborator list. It is the page to build first, not last.

#### Blocks — six, each justified by a page that needs it

| Block | Needed by | Why it is not just rich text |
|---|---|---|
| `block_richtext` | every page | The workhorse. Wraps in `.prose`; Phase 2 base styles already handle it |
| `block_media` | performance, about | Image or video with caption, aspect ratio, and a full-bleed toggle |
| `block_logos` | home | Grouped supporter logos — four groups, each with a heading, each logo needing alt text and a link |
| `block_people` | about | Name / role / URL, repeated twice with different framing. Structured because it must stay consistent |
| `block_faq` | faqs | Q&A pairs that need real semantics and per-question anchors |
| `block_advisory` | disclaimers, archive | A content warning. On an archive of violence this is an ethical obligation, not a callout style — it must be a first-class object that can be queried and shown before media |

#### Deliberately NOT built yet

- **`block_quote`** — the *Clockwork Orange* quotation is currently expressible as a
  `blockquote` inside rich text, which Phase 2 already styles. It becomes a block the moment a
  page wants a pull quote laid out differently from the prose flow. Most likely first addition.
- **`block_columns` (nested M2A)** — no intended page needs side-by-side blocks yet. Nesting
  is still verified against the model (§4.3) so the ceiling is known before it is needed.
- **`block_archive_ref`** — waits for Phase 3. The archive item type does not exist yet.
- **`block_raw`** — the escape hatch stays available but unused. If it starts appearing, §4.1
  was wrong.
- **A table-of-contents block.** `about.md` authors its contents list by hand. That is a
  rendering concern, not content: every block carries an optional `anchor`, and the TOC is
  derived. Authoring it by hand guarantees it goes stale.

#### Two findings for other phases

1. **Q4 is effectively answered, and the answer changes Phase 3's arithmetic.** ~2,000 hours
   across 800 sources is not "500 plays of a 2GB work". ADR-004 accepted whole-file egress on
   the assumption of a small archive that people sample; at this scale, casual browsing is
   exactly the traffic pattern, and it is the expensive one. **The HLS trigger in Phase 3 §3.8
   needs to be set against these numbers, not a hypothetical.** Still a Phase 3 decision — but
   it should not be made without this figure in front of whoever makes it.

2. **`performance.md` embeds a video straight from S3** —
   `aam-purgatory-archive.s3.eu-north-1.amazonaws.com/static/performance-mockup.mp4`. That is
   hard rule 3, and it is live in the current site. Egress at $0.09/GB, billed per view.
   Whatever else Phase 3 does, this URL goes through CloudFront.

---

### 4.2 — The page tree

**`pages`**

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `status` | string | `draft` / `published` / `archived` |
| `title` | string | |
| `slug` | string | unique **per parent**, not globally |
| `parent` | m2o → `pages` | self-reference — this is the hierarchy |
| `sort` | integer | sibling order |
| `blocks` | **m2a** | → block collections |
| `seo` | group | title, description, share image |
| system fields | | created/updated/updated-by |

Full path is derived by walking `parent`. **Do not walk the tree per request.** Either cache
the resolved path, or maintain a `path` field via a Flow on save. Decide now; retrofitting
path resolution once URLs are public means redirects.

### 4.3 — Blocks

One Directus collection per block type. A starting hypothesis, to be revised against §4.1:

- `block_richtext` — heading + WYSIWYG body
- `block_media` — image or video, caption, display mode (inline / full-bleed)
- `block_archive_ref` — reference to an archive item, with playback options
- `block_columns` — **nested M2A**, so blocks can contain blocks
- `block_quote` — pull quote with attribution
- `block_raw` — deliberate escape hatch for genuinely one-off artistic layouts

**Verify nested M2A works to the depth this site needs before declaring the model sound.**
Arbitrary nesting is where block-based CMSes usually disappoint, and finding the ceiling after
building twenty pages is expensive.

On `block_raw`: an escape hatch is right for an experimental site, but **track its usage**. If
it appears on most pages, the block set is wrong and §4.1 needs redoing.

### 4.4 — Render

`app/components/blocks/`, one component per block type, **name-matched to the collection** so
resolution is mechanical rather than a hand-maintained map:

```vue
<!-- app/components/BlockRenderer.vue -->
<script setup lang="ts">
defineProps<{ blocks: PageBlock[] }>()
const resolve = (collection: string) =>
  resolveComponent(
    collection.replace(/^block_/, 'Block').replace(/_(\w)/g, (_, c) => c.toUpperCase())
  )
</script>

<template>
  <component v-for="b in blocks" :is="resolve(b.collection)" :key="b.id" v-bind="b.item" />
</template>
```

Rules:

- Blocks are **dumb and presentational**. A block that fetches its own data is a bug — data
  shaping happens in composables. (Hard rule: style section.)
- Built from Phase 2 primitives. If a block needs a primitive that does not exist, add it to
  the design system rather than writing bespoke CSS inside the block.
- `block_richtext` should need **almost no CSS**, because Phase 2's base element styles already
  handle prose. If it needs a lot, the base styles are wrong — fix them there.
- Every block keyboard-navigable where interactive.

### 4.5 — Rendering strategy

| Route group | Mode | Why |
|---|---|---|
| Content pages | prerender / ISR | Fast, cheap, good for a mostly-static site |
| Archive browser | client-rendered | Interactive, public |
| Booking | SSR | Phase 6 — must reflect live availability |

Decide how a publish triggers a rebuild. A Directus Flow hitting a deploy webhook is the usual
answer. Sort it now, or editors will publish and see nothing change, which is the fastest way
to lose their trust in the system.

### 4.6 — Live Preview

Configure Directus Live Preview to point at a Nuxt preview route rendering draft content.

This is one of the main reasons ADR-001 chose Directus. On a site where layout *is* the
content, an editor who cannot see the result is editing blind.

Verify: change a block, see it in the preview pane without saving and switching tabs.

### 4.7 — Editor role

Create the **Editor** role now, even though no editor uses it yet: access to `pages`, block
collections, and the assets folder. Nothing else — no user administration, no schema, no
settings.

Public read on `status = 'published'` only. **Verify by issuing an unauthenticated request for
a draft** and confirming 403/404. A permissions matrix that looks right and behaves wrong is
the normal outcome of not testing it.

### 4.8 — Directus asset storage

Point the Directus S3 adapter at the **assets** bucket from Phase 3 — never the archive bucket.
Check current Directus docs for exact `STORAGE_*` variable names.

Verify: upload an image in the admin, confirm it lands in the assets bucket.

### 4.9 — Build real pages

Build **at least five real pages** with intended content — including the most structurally
awkward one you can think of.

This is the phase's actual test. Every block you find yourself wishing existed is a finding.
Every time you reach for `block_raw`, ask whether a real block type is hiding there.

---

## Acceptance criteria

- [ ] Five or more real pages built entirely through the Directus admin, rendering correctly
      on desktop and mobile.
- [ ] The most structurally awkward intended page is one of them.
- [ ] Nested blocks work to the depth actually needed.
- [ ] `block_richtext` requires almost no block-specific CSS.
- [ ] Live Preview reflects unsaved changes.
- [ ] Unauthenticated request for a draft returns 403/404 — verified by request.
- [ ] Page hierarchy renders correct URLs; nesting works; slugs unique per parent.
- [ ] Publishing triggers a rebuild and the change appears.
- [ ] Editor role verified by acting as an editor, not by reading the permissions matrix.
- [ ] Directus uploads land in the assets bucket, not the archive bucket.
- [ ] Schema snapshotted and committed.
- [ ] `block_raw` usage across the five pages is low. If it is high, redo §4.1.

---

## Guardrails — out of scope for Phase 4

- **Do not onboard editors yet.** By explicit decision, they come after the content design
  settles. Note what to show them; invite nobody.
- **Do not build auth or booking.** Phases 5 and 6.
- **Do not point Directus at the archive bucket.**
- **Do not add block types speculatively.** Only when a real page demands one.
- **Do not write bespoke CSS inside blocks.** Extend the design system instead.
- **Do not let blocks fetch their own data.**
- **Do not build a page-builder UI of your own.** Directus's M2A interface is the reason it
  was chosen. If it is genuinely inadequate, that is an ADR-001 finding worth raising, not
  something to paper over with a custom app.

---

## Record before closing — status 2026-08-25

### Done

- **Six block types**, each justified by a real page (§4.1 outcome above). `block_raw` was
  never needed — usage is zero across all five pages, which is the signal §4.1 asked for.
- **Page tree** with self-referencing `parent`; paths derived in `server/utils/pages.ts`, not
  stored. The parent walk is depth-limited, so an editor creating a parent cycle in the admin
  gets a dropped page and a log line rather than a hung request handler.
- **Five real pages** seeded from the project's own copy (`scripts/seed-pages.ts`) — home,
  about, research, faqs, disclaimers. About is the awkward one: eight blocks, six sections,
  a long quotation, two people lists, and a full-bleed media block.
- **Live Preview** at `/preview?id={{id}}&token=…`, wired into the `pages` collection.
  Token-guarded; without it, or with a wrong one, the route 404s.
- **Editor role and policy** created with access to pages, blocks and files — and nothing
  else. No users, roles, policies, settings or schema.
- **Public Directus access to content collections is zero, deliberately.** Every public read
  goes through a Nitro route that filters `status = 'published'`. Granting Directus public
  read as well would create a second, unfiltered path to the same data.
- **Rendering strategy**: SWR with a 600s window rather than prerender, because prerendering
  would require a live Directus during `pnpm build` — a build that fails for reasons
  unrelated to the code. That also answers "how does a publish trigger a rebuild": it does
  not; the page revalidates. Immediate invalidation needs a deploy target — Phase 7.

### Verified by request, not by reading a matrix

| Check | Result |
|---|---|
| Five pages render | 200 each, desktop and at 390px |
| Draft via public route | **404** |
| Draft via Directus, unauthenticated | **403** |
| Preview without token | **404** |
| Preview with wrong token | **404** |
| Preview with token | renders, `status: draft`, `noindex` |
| Horizontal overflow at 390px | none, on any page |
| `pnpm directus:apply` on the committed snapshot | no diff |

### Three bugs worth recording

1. **The `resolveComponent` snippet in §4.4 of this document is wrong.** Replacing `^block_`
   with `Block` and then camel-casing remaining underscores yields `Blockrichtext` for any
   single-word block — there is no underscore left to trigger capitalisation. Every block
   then renders as an unknown element, which in SSR output puts the content in HTML
   *attributes*: it greps as present and displays as nothing. Corrected in `BlockRenderer.vue`
   and covered by a test.

2. **Block components need `global: true`.** Nuxt resolves `resolveComponent('Foo')` at build
   time by reading the literal string. A block renderer passes a variable, so without global
   registration the components are never bundled. Same silent-blank-page failure.

3. **`pathPrefix: false` is required too**, or they register as `BlocksBlockRichtext`.

All three produce an identical symptom — a page with a header and nothing under it — which is
why `BlockRenderer` now renders a visible `BlockMissing` marker instead of failing quietly.

### Not done — and why

- **§4.8, Directus asset storage.** Needs the S3 assets bucket from Phase 3, and there is no
  AWS account wired up yet. Directus is on local disk storage; uploads work, they are simply
  not in S3. **This is a real gap, not a decision.**
- **Nested M2A (`block_columns`).** No intended page needs side-by-side blocks. The nesting
  ceiling is therefore still unmeasured — §4.3 asks for it to be verified before the model is
  declared sound, and that remains outstanding for whenever a page first wants it.
- **Editor onboarding.** Out of scope by explicit decision; the role exists with no members.
- **Pages were seeded by script, not clicked into the admin.** The acceptance criterion asks
  for pages built through the admin, and the intent behind it — proving the M2A editing
  experience is usable — has not been tested by a human sitting in the interface. Worth doing
  before anyone declares the content model settled.

---

## Record before closing

- Final block set and the page that justified each: ______
- `block_raw` usage rate: ______
- Nesting depth verified: ______
- Notes for editor onboarding later: ______
