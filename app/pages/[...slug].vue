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
/* Content stops well clear of the window edge. Without this the last block
   sits flush against the bottom, which reads as a page that was cut off —
   and there is no footer now to provide the gap. */
.content-page {
  padding-block-end: var(--space-3xl);
}

.page-header {
  padding-block-start: var(--space-2xl);
  padding-block-end: var(--space-xl);
}

.page-header__summary {
  font-size: var(--text-md);
  line-height: var(--leading-snug);
  color: var(--ink-muted);
}
</style>
