<script setup lang="ts">
/**
 * Vertical rhythm. Space between siblings, never at the Stack's own edges.
 *
 * <Stack space="l"> or <Stack space="2.5rem">
 */
const props = withDefaults(defineProps<{
  /** A space token step (`xs`, `m`, `2xl`) or any CSS length. */
  space?: string
  /** Render as something other than a div — `section`, `article`, `ul`. */
  as?: string
}>(), {
  space: 'm',
  as: 'div',
})

const resolvedSpace = computed(() => resolveSpace(props.space))
</script>

<template>
  <component
    :is="as"
    class="stack"
    :style="{ '--stack-space': resolvedSpace }"
  >
    <slot />
  </component>
</template>
