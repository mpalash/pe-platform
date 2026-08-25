<script setup lang="ts">
/**
 * Horizontal grouping that wraps. Navigation, tag lists, action rows.
 */
const props = withDefaults(defineProps<{
  space?: string
  align?: 'start' | 'center' | 'end' | 'baseline'
  justify?: 'start' | 'center' | 'end' | 'between'
  as?: string
}>(), {
  space: 's',
  align: 'center',
  justify: 'start',
  as: 'div',
})

const flexValue: Record<string, string> = {
  start: 'flex-start',
  end: 'flex-end',
  center: 'center',
  between: 'space-between',
  baseline: 'baseline',
}

const resolvedSpace = computed(() => resolveSpace(props.space))
</script>

<template>
  <component
    :is="as"
    class="cluster"
    :style="{
      '--cluster-space': resolvedSpace,
      '--cluster-align': flexValue[align],
      '--cluster-justify': flexValue[justify],
    }"
  >
    <slot />
  </component>
</template>
