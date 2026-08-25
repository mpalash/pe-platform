<script setup lang="ts">
/**
 * A content warning.
 *
 * On an archive of depicted violence this is an ethical obligation rather than
 * a callout style, which is why it is a block type of its own rather than a
 * paragraph someone might reformat away.
 *
 * The long enumeration of depicted content goes inside a <details>: present and
 * readable for anyone who needs to judge whether to continue, but not a wall
 * thrown across the page for everyone else.
 */
const props = defineProps<{
  title: string
  anchor?: string | null
  severity?: string | null
  body?: string | null
  detail?: string | null
  detail_label?: string | null
}>()

const isAdvisory = computed(() => (props.severity ?? 'advisory') === 'advisory')
</script>

<template>
  <Center as="section">
    <aside
      class="advisory"
      :data-severity="severity ?? 'advisory'"
      :aria-labelledby="anchor ?? undefined"
      :role="isAdvisory ? 'note' : undefined"
    >
      <Stack space="s">
        <h2
          :id="anchor ?? undefined"
          class="advisory__title"
        >
          {{ title }}
        </h2>

        <!-- eslint-disable-next-line vue/no-v-html -- trusted editor content -->
        <div
          v-if="body"
          class="prose"
          v-html="body"
        />

        <details
          v-if="detail"
          class="advisory__detail"
        >
          <summary>{{ detail_label || 'Show the full list' }}</summary>
          <p>{{ detail }}</p>
        </details>
      </Stack>
    </aside>
  </Center>
</template>

<style scoped>
.advisory {
  border-inline-start: 2px solid var(--rule-strong);
  padding-inline-start: var(--space-l);
}

.advisory[data-severity='advisory'] {
  border-inline-start-color: var(--accent);
}

.advisory__title {
  font-size: var(--text-base);
  font-weight: var(--weight-medium);
  letter-spacing: var(--tracking-wide);
  text-transform: uppercase;
}

.advisory[data-severity='advisory'] .advisory__title {
  color: var(--accent);
}

.advisory__detail summary {
  padding-block: var(--space-xs);
  font-size: var(--text-sm);
  color: var(--ink-muted);
  cursor: pointer;
}

.advisory__detail p {
  font-size: var(--text-sm);
  line-height: var(--leading-normal);
  color: var(--ink-faint);
  /* A very long comma-separated list. Loosening the measure here would make it
     unreadable; keeping it narrow makes it scannable. */
  max-inline-size: var(--measure);
}
</style>
