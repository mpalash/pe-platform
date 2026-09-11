<script setup lang="ts">
/**
 * Which archive clip the participant was watching at this point in their
 * session — from the session's filenames.csv, via useSessionCues.
 *
 * Over the video, bottom-left, and deliberately NOT a live region: the title
 * changes every few seconds as the session moves through clips, and a screen
 * reader announcing each one would drown out everything else. It is plain
 * text on the page, readable whenever someone goes looking for it.
 *
 * `pointer-events: none`, so a click still reaches the video underneath.
 */
defineProps<{ title: string | null }>()
</script>

<template>
  <p
    v-if="title"
    class="cue frosted"
    :title="title"
  >
    <span class="cue__label">On screen</span>
    <span class="cue__title">{{ title }}</span>
  </p>
</template>

<style scoped>
.cue {
  /* Level 1: a caption resting on the video, not a panel floating over it. */
  --elevation: var(--shadow-1);

  position: absolute;
  inset-inline-start: var(--space-xs);
  inset-block-end: var(--space-xs);
  inline-size: fit-content;
  max-inline-size: calc(100% - var(--space-xs) * 2);
  margin: 0;
  padding: var(--space-3xs) var(--space-xs);

  display: flex;
  gap: var(--space-xs);
  align-items: baseline;
  font-size: var(--text-xs);
  pointer-events: none;
}

.cue__label {
  flex: none;
  color: var(--ink-faint);
  letter-spacing: var(--tracking-wide);
  text-transform: uppercase;
}

/* One line, truncated — the archive's clip names run long. Full title on hover. */
.cue__title {
  min-inline-size: 0;
  overflow: hidden;
  color: var(--ink);
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
