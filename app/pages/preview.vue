<script setup lang="ts">
/**
 * Directus Live Preview target. (Phase 4 §4.6.)
 *
 * Renders exactly what a published page renders — same layout, same blocks —
 * because a preview that differs from the real thing is worse than none: it
 * teaches editors to distrust what they see.
 */
const route = useRoute()

// No caching: the whole point is to reflect the editor's current state.
const { data: page, error } = await useFetch('/api/content/preview', {
  query: { id: route.query.id, token: route.query.token },
  key: () => `preview:${String(route.query.id)}`,
  cache: 'no-cache',
})

useHead({ title: () => `Preview — ${page.value?.title ?? ''}` })

// Draft pages should never be indexed, even if a preview URL escapes.
useSeoMeta({ robots: 'noindex, nofollow' })
</script>

<template>
  <article v-if="page">
    <Center
      class="preview-banner"
      measure="full"
    >
      <p>
        Preview — <strong>{{ page.status }}</strong>. Not the published page.
      </p>
    </Center>

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

  <Center
    v-else
    as="section"
    class="page-header"
  >
    <p>{{ error?.statusMessage ?? 'Nothing to preview.' }}</p>
  </Center>
</template>

<style scoped>
.preview-banner {
  background: var(--accent);
  color: var(--ink-inverse);
  padding-block: var(--space-2xs);
  font-size: var(--text-xs);
  text-align: center;
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
