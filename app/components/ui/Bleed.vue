<script setup lang="ts">
/**
 * Escapes the content measure for full-width media, from inside constrained
 * prose, without restructuring the page wrapper.
 *
 * `gutter` keeps the page gutter — usually what "full width" means on a phone.
 */
withDefaults(defineProps<{
  gutter?: boolean
  as?: string
}>(), {
  gutter: false,
  as: 'div',
})
</script>

<template>
  <component
    :is="as"
    class="bleed"
    :class="{ 'bleed--gutter': gutter }"
  >
    <slot />
  </component>
</template>
