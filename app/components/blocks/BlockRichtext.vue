<script setup lang="ts">
/**
 * Prose. The workhorse.
 *
 * Note how little CSS is here: Phase 2's base element styles already handle
 * everything a rich-text editor emits. If this block ever needs real styling,
 * the base styles are wrong and that is where to fix it. (Phase 4 §4.4.)
 */
defineProps<{
  title?: string | null
  anchor?: string | null
  body?: string | null
}>()
</script>

<template>
  <!-- Default measure, not wide: .prose centres itself, so a wider column here
       would offset the body from its own heading. -->
  <Center as="section">
    <h2
      v-if="title"
      :id="anchor ?? undefined"
    >
      {{ title }}
    </h2>
    <!-- eslint-disable-next-line vue/no-v-html -- trusted editor content from Directus -->
    <div
      v-if="body"
      class="prose"
      v-html="body"
    />
  </Center>
</template>

<style scoped>
h2 + .prose {
  margin-block-start: var(--space-l);
}
</style>
