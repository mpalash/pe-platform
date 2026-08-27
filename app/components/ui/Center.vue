<script setup lang="ts">
/**
 * Constrains to the measure and centres. The default wrapper for readable text.
 */
const props = withDefaults(defineProps<{
  measure?: 'default' | 'wide' | 'narrow' | 'full'
  /** Drop the horizontal gutter so children reach the window edge. */
  flush?: boolean
  as?: string
}>(), {
  measure: 'default',
  flush: false,
  as: 'div',
})

const measureVar = computed(() => ({
  default: 'var(--measure)',
  wide: 'var(--measure-wide)',
  narrow: 'var(--measure-narrow)',
  full: '100%',
}[props.measure]))
</script>

<template>
  <component
    :is="as"
    class="center"
    :class="{ 'center--flush': flush }"
    :style="{ '--center-measure': measureVar }"
  >
    <slot />
  </component>
</template>
