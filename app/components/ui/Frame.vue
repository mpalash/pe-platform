<script setup lang="ts">
/**
 * Aspect-ratio container. Reserves space before media loads, which is what
 * stops layout shift — the archive depends on this.
 *
 * `fit="contain"` letterboxes rather than crops: correct when the framing of
 * the work is part of the work.
 */
withDefaults(defineProps<{
  /** Any CSS aspect-ratio value: `16 / 9`, `1`, `3 / 4`. */
  ratio?: string
  fit?: 'cover' | 'contain'
  as?: string
}>(), {
  ratio: '16 / 9',
  fit: 'cover',
  as: 'div',
})
</script>

<template>
  <component
    :is="as"
    class="frame"
    :style="{ '--frame-ratio': ratio, '--frame-fit': fit }"
  >
    <slot />
  </component>
</template>
