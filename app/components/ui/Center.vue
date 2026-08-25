<script setup lang="ts">
/**
 * Constrains to the measure and centres. The default wrapper for readable text.
 */
const props = withDefaults(defineProps<{
  measure?: 'default' | 'wide' | 'narrow' | 'full'
  as?: string
}>(), {
  measure: 'default',
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
    :style="{ '--center-measure': measureVar }"
  >
    <slot />
  </component>
</template>
