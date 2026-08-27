<script setup lang="ts">
/**
 * The intensity scale, as a vertical drag-to-select range.
 *
 * Vertical because the toolbar is a column, and because a column is the one
 * arrangement where the bin NAMES fit. Across 240px each of fifteen bins got
 * about fourteen pixels — not enough for "War-10" at any readable size, which
 * is why the horizontal version had to fall back to colour alone. Down the
 * side there is room for the swatch and the word, so the scale is legible
 * again without giving up the ramp.
 *
 * Peace at the top, war at the bottom: the same order as BINS, read the way a
 * list is read.
 *
 * Selection:
 *   drag across the bins  → the range you dragged over, either direction
 *   click a bin           → that single bin
 *   click the sole bin    → clear
 *   click with a range    → restart from that single bin
 *
 * The drag is tracked on the CONTAINER, not on the bins. Deriving the index
 * from the pointer's y within the track means the selection keeps following
 * once the pointer leaves the element sideways, which is what a drag on a thin
 * column does constantly. Per-bin `pointerenter` would drop it every time.
 *
 * Keyboard is unaffected: each bin is still a real <button> with aria-pressed,
 * and Enter or Space runs the same click path (hard rule 11).
 */
const props = defineProps<{
  modelValue: [number, number] | null
}>()

const emit = defineEmits<{ 'update:modelValue': [[number, number] | null] }>()

const bins = BINS

const track = useTemplateRef<HTMLElement>('track')
const dragging = ref(false)

/** Where the drag started, so the range can grow in either direction. */
let anchor = 0
/** Distinguishes a click from a drag — only a click may clear the selection. */
let moved = false
/**
 * Whether the bin under the pointer was already the whole selection when the
 * press began. Read at pointerdown, because pointerdown immediately overwrites
 * the model and the answer is gone by the time pointerup needs it.
 */
let wasSoleSelection = false

function isActive(index: number): boolean {
  if (!props.modelValue) return false
  const [start, end] = props.modelValue
  return index >= start && index <= end
}

/**
 * Which bin the pointer is over, from its y alone.
 *
 * Clamped rather than nulled outside the track: dragging past the last bin
 * should select up to the last bin, not abandon the drag.
 */
function indexAt(clientY: number): number {
  const el = track.value
  if (!el) return 0

  const rect = el.getBoundingClientRect()
  const step = rect.height / bins.length
  const raw = Math.floor((clientY - rect.top) / step)

  return Math.min(Math.max(raw, 0), bins.length - 1)
}

function onPointerDown(event: PointerEvent): void {
  if (event.button !== 0) return

  anchor = indexAt(event.clientY)
  moved = false
  dragging.value = true

  // Capture on the container so movement outside it still reports.
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  emit('update:modelValue', [anchor, anchor])

  // Stops the browser selecting the labels as text mid-drag.
  event.preventDefault()
}

function onPointerMove(event: PointerEvent): void {
  if (!dragging.value) return

  const index = indexAt(event.clientY)
  if (index !== anchor) moved = true

  emit('update:modelValue', [Math.min(anchor, index), Math.max(anchor, index)])
}

function onPointerUp(event: PointerEvent): void {
  if (!dragging.value) return

  dragging.value = false
  ;(event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId)

  // A click — not a drag — on a bin that was already the entire selection
  // clears it. Checked against what the pointerdown produced, hence [i, i].
  const range = props.modelValue
  if (!moved && wasSoleSelection && range && range[0] === anchor && range[1] === anchor) {
    emit('update:modelValue', null)
  }
}

function noteSoleSelection(event: PointerEvent): void {
  const index = indexAt(event.clientY)
  const range = props.modelValue
  wasSoleSelection = Boolean(range && range[0] === index && range[1] === index)
}

function onTrackPointerDown(event: PointerEvent): void {
  noteSoleSelection(event)
  onPointerDown(event)
}

/**
 * Keyboard equivalent of a click, kept on the button so Enter and Space work
 * without the pointer path. Behaves as the click case above.
 */
function selectSingle(index: number): void {
  const range = props.modelValue
  const sole = range && range[0] === index && range[1] === index

  emit('update:modelValue', sole ? null : [index, index])
}

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
      ref="track"
      class="bins__track"
      :class="{ 'bins__track--dragging': dragging }"
      role="group"
      aria-label="Filter by intensity. Drag across the scale to select a range."
      @pointerdown="onTrackPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
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
        @keydown.enter.prevent="selectSingle(index)"
        @keydown.space.prevent="selectSingle(index)"
      >
        <span
          class="bins__swatch"
          aria-hidden="true"
          :style="{ background: colorFor(bin) }"
        />
        <span class="bins__name">{{ bin }}</span>
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
  flex-direction: column;
  gap: var(--space-2xs);
  align-items: stretch;
  inline-size: 100%;
}

.bins__track {
  display: flex;
  flex-direction: column;
  /*
   * No gap. The bins are a continuous scale, and a gap turns it into fifteen
   * separate controls — it also puts dead zones under a drag, where the
   * pointer is over the track but not over any bin.
   */
  gap: 0;
  /* The pointer handlers own the gesture; without this, touch scrolls the
     panel instead of selecting. */
  touch-action: none;
}

.bins__track--dragging {
  cursor: grabbing;
  user-select: none;
}

.bins__bin {
  display: flex;
  align-items: center;
  gap: var(--space-2xs);
  inline-size: 100%;
  padding: 0;
  border: 0;
  background: none;
  block-size: 1.15rem;
  cursor: pointer;
  text-align: start;
  /*
   * The buttons are decoration for the pointer: the container reads the
   * gesture from coordinates, and a button swallowing the event would break a
   * drag the moment it crossed one. They stay focusable for the keyboard.
   */
  pointer-events: none;
}

.bins__bin:focus-visible {
  /* Focus still has to be visible even though the button ignores the pointer. */
  outline-offset: -2px;
}

.bins__swatch {
  flex: none;
  display: block;
  inline-size: 1.75rem;
  block-size: 100%;
  opacity: 0.32;
  transition: opacity var(--duration-quick) var(--ease-out);
}

/*
 * Unselected bins stay visible but dimmed, so the whole range of the scale is
 * legible while a subset of it is chosen.
 */
.bins__name {
  font-size: var(--text-2xs);
  letter-spacing: var(--tracking-wide);
  text-transform: uppercase;
  color: var(--ink-faint);
  transition: color var(--duration-quick) var(--ease-out);
  white-space: nowrap;
}

.bins__track:hover .bins__swatch {
  opacity: 0.55;
}

.bins__bin--active .bins__swatch,
.bins__track:hover .bins__bin--active .bins__swatch {
  opacity: 1;
}

.bins__bin--active .bins__name {
  color: var(--ink);
}

.bins__label {
  font-size: var(--text-2xs);
  letter-spacing: var(--tracking-wide);
  text-transform: uppercase;
  color: var(--ink-faint);
}

@media (prefers-reduced-motion: reduce) {
  .bins__swatch,
  .bins__name {
    transition-duration: 1ms;
  }
}
</style>
