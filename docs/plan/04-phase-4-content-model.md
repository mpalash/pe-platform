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

## Record before closing

- Final block set and the page that justified each: ______
- `block_raw` usage rate: ______
- Nesting depth verified: ______
- Notes for editor onboarding later: ______
