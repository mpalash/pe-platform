<script setup lang="ts">
/**
 * The intensity scale, as a contiguous-range selector.
 *
 * Ported from pe-vue. Selection behaviour, unchanged because it is good:
 *   nothing selected + click        → that single bin
 *   single bin       + click other  → the range between them, either direction
 *   single bin       + click itself → clear
 *   range            + click        → restart from that single bin
 *
 * Each bin is a real <button> with aria-pressed, so the whole scale is operable
 * from the keyboard (hard rule 11).
 */
const props = defineProps<{
  modelValue: [number, number] | null
}>()

const emit = defineEmits<{ 'update:modelValue': [[number, number] | null] }>()

const bins = BINS

function isActive(index: number): boolean {
  if (!props.modelValue) return false
  const [start, end] = props.modelValue
  return index >= start && index <= end
}

function select(index: number): void {
  const range = props.modelValue

  if (!range) {
    emit('update:modelValue', [index, index])
    return
  }

  const [start, end] = range

  if (start === end) {
    if (index === start) emit('update:modelValue', null)
    else emit('update:modelValue', [Math.min(start, index), Math.max(start, index)])
    return
  }

  emit('update:modelValue', [index, index])
}

/** `Peace-05` → `P5`, `War-10` → `W10`. */
function abbreviate(bin: string): string {
  const [prefix, number] = bin.split('-')
  return `${prefix?.[0] ?? ''}${Number.parseInt(number ?? '0', 10)}`
}

const label = computed(() => {
  if (!props.modelValue) return 'All intensities'
  const [start, end] = props.modelValue
  return start === end ? bins[start]! : `${bins[start]} – ${bins[end]}`
})
</script>

<template>
  <div class="bins">
    <div
      class="bins__scale"
      role="group"
      aria-label="Filter by intensity"
    >
      <button
        v-for="(bin, index) in bins"
        :key="bin"
        type="button"
        class="bins__bin"
        :class="{ 'bins__bin--active': isActive(index) }"
        :data-side="bin.startsWith('Peace') ? 'peace' : 'war'"
        :aria-pressed="isActive(index)"
        :title="bin"
        @click="select(index)"
      >
        <span class="visually-hidden">{{ bin }}</span>
        <span aria-hidden="true">{{ abbreviate(bin) }}</span>
      </button>
    </div>

    <p
      class="bins__label"
      aria-live="polite"
    >
      {{ label }}
    </p>
  </div>
</template>

<style scoped>
.bins {
  display: flex;
  /* nowrap: the toolbar is a single row, and a wrapping scale would make it
     two. The label sits alongside rather than under. */
  flex-wrap: nowrap;
  gap: var(--space-s);
  align-items: center;
}

.bins__scale {
  display: flex;
  gap: 1px;
}

.bins__bin {
  min-inline-size: 2.1rem;
  padding: var(--space-2xs) var(--space-2xs);
  border: 1px solid var(--rule);
  background: var(--surface-raised);
  font-size: var(--text-2xs);
  letter-spacing: var(--tracking-wide);
  color: var(--ink-faint);
  transition:
    background var(--duration-quick) var(--ease-out),
    color var(--duration-quick) var(--ease-out);
}

.bins__bin:hover {
  color: var(--ink);
  border-color: var(--rule-strong);
}

.bins__bin--active {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--ink-inverse);
}

.bins__label {
  white-space: nowrap;
  font-size: var(--text-2xs);
  letter-spacing: var(--tracking-wide);
  text-transform: uppercase;
  color: var(--ink-faint);
}
</style>
