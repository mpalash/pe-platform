<script setup lang="ts">
/**
 * Question and answer pairs.
 *
 * Native <details>/<summary>: keyboard-operable, findable by the browser's own
 * find-in-page when open, and needing no JavaScript at all. A custom accordion
 * would be more code and less accessible.
 */
interface FaqItem {
  question: string
  answer?: string | null
}

const props = defineProps<{
  title?: string | null
  anchor?: string | null
  items?: FaqItem[] | null
}>()

const entries = computed(() => props.items ?? [])

/** Stable per-question anchors so an answer can be linked to directly. */
function slug(question: string): string {
  return question
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 60)
}
</script>

<template>
  <Center as="section">
    <Stack space="l">
      <h2
        v-if="title"
        :id="anchor ?? undefined"
      >
        {{ title }}
      </h2>

      <Stack
        space="2xs"
        as="div"
      >
        <details
          v-for="entry in entries"
          :id="slug(entry.question)"
          :key="entry.question"
          class="faq"
        >
          <summary class="faq__question">
            {{ entry.question }}
          </summary>
          <!-- eslint-disable-next-line vue/no-v-html -- trusted editor content -->
          <div
            v-if="entry.answer"
            class="prose faq__answer"
            v-html="entry.answer"
          />
        </details>
      </Stack>
    </Stack>
  </Center>
</template>

<style scoped>
.faq {
  border-block-end: 1px solid var(--rule);
}

.faq__question {
  padding-block: var(--space-s);
  font-weight: var(--weight-medium);
  cursor: pointer;
  /* The default triangle is fine and free; only its colour needs help. */
  color: var(--ink);
}

.faq__question::marker {
  color: var(--ink-faint);
}

.faq__answer {
  padding-block-end: var(--space-m);
  color: var(--ink-muted);
}
</style>
