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
 * The page is a framed sheet floating inside the window, not content poured
 * against its edges.
 *
 * The frame is what gives a static page a boundary now that the chrome floats
 * over it. Without one, prose sitting in the middle of a black window has
 * nothing to belong to, and the draggable panels look like they are hovering
 * over nothing rather than over a page.
 *
 * The 24px inset is the same clearance `useDraggable` keeps the panels at
 * (`DRAG_MARGIN`), so a panel pushed into a corner lands flush with the frame
 * rather than a few pixels off it.
 */
.content-page {
  --page-inset: 24px;

  box-sizing: border-box;
  min-block-size: calc(100dvh - var(--page-inset) * 2);
  margin: var(--page-inset);
  border: 1px solid var(--rule);
  background: var(--surface);

  /* Content stops well clear of the frame. Without this the last block sits
     flush against the border, which reads as a page that was cut off. */
  padding-block: var(--space-2xl) var(--space-3xl);
  padding-inline: var(--space-gutter);
}

/*
 * The frame supplies the horizontal gutter, so the Centers inside must not
 * add a second one — otherwise every block is inset twice and the 640px
 * measure never actually reaches 640px.
 */
.content-page :deep(.center) {
  --center-gutter: 0px;
}

/*
 * Full-bleed blocks bleed to the FRAME, not to the window.
 *
 * `.bleed` pulls out to 100dvw, which is right on an unframed page and wrong
 * here: a marquee running past the border makes the frame look like something
 * the content escaped rather than something containing it.
 *
 * Same technique as the primitive — measure from your own centre, which is
 * also the page's centre — with the frame's own inset subtracted: the margin,
 * its 1px border, and the padding that supplies the gutter.
 */
.content-page :deep(.bleed) {
  --bleed-inset: calc(var(--page-inset) + 1px + var(--space-gutter));

  inline-size: calc(100dvw - var(--bleed-inset) * 2);
  max-inline-size: calc(100dvw - var(--bleed-inset) * 2);
  margin-inline: calc(50% - 50dvw + var(--bleed-inset));
}

/*
 * Clearance for the floating header, which opens at the top-left corner. On a
 * wide window the 640px column is centred and nowhere near it; on a phone the
 * column is the full width, so the first line of the page would otherwise
 * start underneath the panel.
 */
@media (width < 60rem) {
  .content-page {
    padding-block-start: var(--space-4xl);
  }
}

/*
 * On a phone the frame costs more than it gives: 24px on each side out of a
 * 375px window is most of the gutter, and the border ends up hugging the text.
 * The inset shrinks rather than the frame disappearing, so the page still
 * reads as a sheet.
 */
@media (width < 34rem) {
  .content-page {
    --page-inset: 8px;
    padding-inline: var(--space-m);
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
