<script setup lang="ts">
/**
 * Responsive columns without media queries. Items declare a minimum width and
 * the column count follows from the space available.
 */
const props = withDefaults(defineProps<{
  /** Minimum track width before the grid drops a column. */
  min?: string
  space?: string
  as?: string
}>(), {
  min: '16rem',
  space: 'l',
  as: 'div',
})

const resolvedSpace = computed(() => resolveSpace(props.space))
</script>

<template>
  <component
    :is="as"
    class="grid"
    :style="{ '--grid-min': min, '--grid-space': resolvedSpace }"
  >
    <slot />
  </component>
</template>
