<script setup lang="ts">
/**
 * Every content page. The path is resolved server-side by walking the page
 * tree, so nesting works without any route configuration here.
 *
 * The page fetches; the blocks do not. A block that fetches its own data is a
 * bug (Phase 4 §4.4).
 */
const route = useRoute()

const path = computed(() => {
  const raw = Array.isArray(route.params.slug) ? route.params.slug.join('/') : (route.params.slug ?? '')
  return raw ? `/${raw}` : '/'
})

const { data: page, error } = await useFetch('/api/content/page', {
  query: { path },
  key: () => `page:${path.value}`,
})

if (error.value || !page.value) {
  throw createError({ statusCode: 404, statusMessage: 'Page not found', fatal: true })
}

useSeoMeta({
  title: () => page.value?.seo_title || page.value?.title || '',
  description: () => page.value?.seo_description || page.value?.summary || '',
  ogTitle: () => page.value?.seo_title || page.value?.title || '',
  ogDescription: () => page.value?.seo_description || page.value?.summary || '',
})
</script>

<template>
  <article
    v-if="page"
    class="content-page"
  >
    <!-- Same measure as the blocks below, so the whole page shares one left
         edge. A wider header centres to a different edge and reads as a mistake. -->
    <Center
      as="header"
      class="page-header"
    >
      <Stack space="s">
        <h1>{{ page.title }}</h1>
        <p
          v-if="page.summary"
          class="page-header__summary"
        >
          {{ page.summary }}
        </p>
      </Stack>
    </Center>

    <BlockRenderer :blocks="page.blocks" />
  </article>
</template>

<style scoped>
/*
 * The border wraps the CONTENT, not the window.
 *
 * It used to be a frame inset 24px from every edge — which is a frame around
 * the viewport, and on a wide screen that put a rule a thousand pixels away
 * from the text it was supposedly enclosing. A border that far from what it
 * contains reads as chrome, not as a boundary.
 *
 * So it hugs the measure instead: 640px of content plus `--page-pad` of
 * breathing room on each side, centred, sized to its content vertically. The
 * offset is what makes it a wrapper rather than an outline — tight to the text
 * and the border becomes a box the words are crammed into.
 */
.content-page {
  /* The gap between the border and the content it wraps. */
  --page-pad: var(--space-xl);
  /* Minimum clearance from the window, matching the floating panels. */
  --page-gap: 24px;

  box-sizing: border-box;
  inline-size: calc(100% - var(--page-gap) * 2);
  max-inline-size: calc(var(--measure) + var(--page-pad) * 2);
  margin: var(--page-gap) auto;

  border: 1px solid var(--rule);
  background: var(--surface);
  padding: var(--page-pad);
}

/*
 * The wrapper supplies the horizontal breathing room, so the Centers inside
 * must not add a gutter on top of it — otherwise every block is inset twice
 * and the 640px measure never actually reaches 640px.
 */
.content-page :deep(.center) {
  --center-gutter: 0px;
}

/*
 * Full-bleed blocks bleed to the border, not to the window.
 *
 * Now that the border hugs the content, `.bleed` pulling out to 100dvw would
 * send a marquee straight through it and off both sides of the screen. Inside
 * the wrapper, "full width" means the padding — one negative margin, no
 * viewport arithmetic needed.
 */
.content-page :deep(.bleed) {
  inline-size: auto;
  max-inline-size: none;
  margin-inline: calc(var(--page-pad) * -1);
}

/*
 * Clearance for the floating header, which opens at the top-left corner. On a
 * wide window the wrapper is centred and nowhere near it; below that the two
 * overlap, and the first line of the page would start underneath the panel.
 */
@media (width < 60rem) {
  .content-page {
    padding-block-start: var(--space-4xl);
  }
}

/*
 * On a phone the offset costs more than it gives — 36px a side out of a 375px
 * window is most of the width — so it shrinks rather than the border going
 * away. The page still reads as a wrapped sheet.
 */
@media (width < 34rem) {
  .content-page {
    --page-pad: var(--space-m);
    --page-gap: 8px;
  }
}

.page-header {
  padding-block-end: var(--space-xl);
}

.page-header__summary {
  font-size: var(--text-md);
  line-height: var(--leading-snug);
  color: var(--ink-muted);
}
</style>
