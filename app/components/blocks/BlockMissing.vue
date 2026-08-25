<script setup lang="ts">
/**
 * Rendered when a block collection has no matching component.
 *
 * Visible on purpose. A silently empty page is the worst outcome here — an
 * editor sees their content vanish with no clue why, and the cause is a
 * one-line naming mismatch.
 */
defineProps<{ collection?: string }>()
</script>

<template>
  <Center as="section">
    <p class="missing">
      No component for block type <code>{{ collection ?? 'unknown' }}</code>.
    </p>
  </Center>
</template>

<style scoped>
.missing {
  border: 1px dashed var(--accent);
  padding: var(--space-m);
  font-size: var(--text-sm);
  color: var(--ink-muted);
}
</style>
