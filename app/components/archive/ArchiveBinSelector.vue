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

/**
 * The scale is drawn as its colours, not as fifteen text labels.
 *
 * In a 240px column each bin gets about fourteen pixels, which is not enough
 * for "W10" at any size anyone would want to read — the labels collided and
 * the last one overflowed its cell. The colour ramp is the better signal
 * anyway: it is the same ramp the galaxy colours its tiles with, so the scale
 * and the thing it filters now look like each other.
 *
 * Nothing is lost for assistive tech or for a mouse: each button keeps its
 * full bin name as visually-hidden text and as its title.
 */
function colorFor(bin: string): string {
  return BIN_COLORS[bin] ?? 'transparent'
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
        <span
          class="bins__swatch"
          aria-hidden="true"
          :style="{ background: colorFor(bin) }"
        />
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
/*
 * A column, because the toolbar is one. The label sits above the scale rather
 * than beside it — fifteen bins plus a label will not fit across 240px on any
 * reading of the type scale.
 */
.bins {
  display: flex;
  flex-direction: column;
  gap: var(--space-2xs);
  align-items: flex-start;
  inline-size: 100%;
}

/*
 * The fifteen bins are a scale, so they stay in one contiguous run: a grid of
 * equal fractions rather than a flex row that wraps five onto a second line
 * and breaks the peace-to-war reading. Equal columns also make the whole thing
 * fit whatever width the panel is, without per-bin sizing.
 */
.bins__scale {
  display: grid;
  grid-template-columns: repeat(15, 1fr);
  gap: 1px;
  inline-size: 100%;
}

.bins__bin {
  min-inline-size: 0;
  padding: 0;
  border: 0;
  background: none;
  /* A comfortable hit target over a 6px swatch — the tappable area is the
     button, not the mark inside it. */
  block-size: 1.5rem;
  display: grid;
  place-items: stretch;
  cursor: pointer;
}

/*
 * Unselected bins are dimmed rather than hidden, so the full range of the
 * scale stays visible while a subset of it is chosen.
 */
.bins__swatch {
  display: block;
  block-size: 100%;
  opacity: 0.32;
  transition:
    opacity var(--duration-quick) var(--ease-out),
    outline-color var(--duration-quick) var(--ease-out);
}

.bins__bin:hover .bins__swatch {
  opacity: 0.7;
}

.bins__bin--active .bins__swatch {
  opacity: 1;
}

.bins__label {
  white-space: nowrap;
  font-size: var(--text-2xs);
  letter-spacing: var(--tracking-wide);
  text-transform: uppercase;
  color: var(--ink-faint);
}
</style>
