<script setup lang="ts">
/**
 * Thumbnail grid. Ported from pe-vue's VideoFeedGrid.
 *
 * Virtualised on rows rather than items: the archive is 30,651 clips, and a
 * grid of that many <img> elements would stall the browser before it ran out
 * of memory. Only the rows near the viewport are in the DOM.
 *
 * Thumbnails, not video — that is the point of the grid. It shows a lot of the
 * archive at once and costs almost nothing to scroll, where the feed shows one
 * clip properly and costs a video decode.
 */
const props = withDefaults(defineProps<{
  ids: string[]
  /** Rows rendered beyond the viewport, above and below. */
  overscan?: number
}>(), {
  overscan: 2,
})

const archive = useArchive()
const selection = useArchiveSelection()

const viewport = useTemplateRef<HTMLElement>('viewport')

const columns = ref(4)
const rowHeight = ref(150)
const viewportHeight = ref(0)
const scrollTop = ref(0)

/** Aspect of the source thumbnails. They are 16:9 stills from the clips. */
const TILE_RATIO = 16 / 9
const MIN_TILE = 180

const rowCount = computed(() => Math.ceil(props.ids.length / columns.value))
const totalHeight = computed(() => rowCount.value * rowHeight.value)

const range = computed(() => {
  if (rowHeight.value <= 0) return { start: 0, end: Math.min(rowCount.value, 4) }

  const visible = Math.ceil(viewportHeight.value / rowHeight.value)
  const start = Math.max(0, Math.floor(scrollTop.value / rowHeight.value) - props.overscan)
  const end = Math.min(rowCount.value, start + visible + props.overscan * 2)

  return { start, end }
})

const rows = computed(() => {
  const out: Array<{ index: number, ids: string[] }> = []

  for (let row = range.value.start; row < range.value.end; row++) {
    out.push({
      index: row,
      ids: props.ids.slice(row * columns.value, row * columns.value + columns.value),
    })
  }

  return out
})

function measure(): void {
  const el = viewport.value
  if (!el) return

  const width = el.getBoundingClientRect().width
  if (width <= 0) return

  viewportHeight.value = window.innerHeight
  columns.value = Math.max(1, Math.floor(width / MIN_TILE))

  const gap = 2
  const tileWidth = (width - gap * (columns.value - 1)) / columns.value
  rowHeight.value = tileWidth / TILE_RATIO + gap
}

function onScroll(): void {
  scrollTop.value = window.scrollY - (viewport.value?.offsetTop ?? 0)
}

let resizeObserver: ResizeObserver | null = null

onMounted(() => {
  measure()
  onScroll()

  window.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('resize', measure, { passive: true })

  if (viewport.value) {
    resizeObserver = new ResizeObserver(() => measure())
    resizeObserver.observe(viewport.value)
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('scroll', onScroll)
  window.removeEventListener('resize', measure)
  resizeObserver?.disconnect()
})

watch(() => props.ids, () => {
  scrollTop.value = 0
  if (import.meta.client) window.scrollTo({ top: 0, behavior: 'auto' })
})

function posterFor(id: string): string | null {
  const item = archive.getItem(id)
  return item ? usePlaybackSource(item.filename).poster : null
}

function nameFor(id: string): string {
  return archive.getItem(id)?.name ?? ''
}

/**
 * Thumbnails fade in as they arrive.
 *
 * These load from S3 at wildly different speeds, and without this the grid
 * pops in tile by tile, which on a wall of violent imagery is genuinely
 * jarring. Tracked per id rather than per tile because rows are recycled as
 * you scroll — keyed on the element, a recycled row would replay the fade for
 * an image that was already loaded.
 */
const loaded = useState<Set<string>>('archive:gridLoaded', () => new Set())

function isLoaded(id: string): boolean {
  return loaded.value.has(id)
}

function onLoad(id: string): void {
  if (loaded.value.has(id)) return
  // Replaced rather than mutated so the template re-renders.
  loaded.value = new Set(loaded.value).add(id)
}

/**
 * Catches images the browser had already finished with.
 *
 * A cached image is `complete` before the element is even attached, so its
 * `load` event never fires and the tile would sit at opacity 0 for ever. That
 * is the failure mode of every naive fade-in: it works on a cold load and
 * leaves a blank grid on the second visit.
 */
function markIfComplete(id: string, el: Element | null): void {
  const img = el as HTMLImageElement | null
  if (img?.complete && img.naturalWidth > 0) onLoad(id)
}
</script>

<template>
  <div
    ref="viewport"
    class="grid"
  >
    <p
      v-if="ids.length === 0"
      class="grid__empty"
    >
      Nothing matches those filters.
    </p>

    <div
      v-else
      class="grid__spacer"
      :style="{ blockSize: `${totalHeight}px` }"
    >
      <div
        v-for="row in rows"
        :key="row.index"
        class="grid__row"
        :style="{
          transform: `translateY(${row.index * rowHeight}px)`,
          gridTemplateColumns: `repeat(${columns}, 1fr)`,
        }"
      >
        <!--
          A real <button>: the tile opens a dialog, so it is a control, not a
          link. Keyboard users get it in the tab order for free.
        -->
        <button
          v-for="id in row.ids"
          :key="id"
          type="button"
          class="grid__tile"
          :data-binned="Boolean(archive.getItem(id)?.bin)"
          @click="selection.open(id)"
        >
          <img
            v-if="posterFor(id)"
            :ref="el => markIfComplete(id, el as Element | null)"
            :src="posterFor(id)!"
            :alt="nameFor(id)"
            loading="lazy"
            decoding="async"
            :data-loaded="isLoaded(id)"
            @load="onLoad(id)"
          >
          <span
            v-else
            class="grid__fallback"
          >{{ nameFor(id) }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.grid {
  position: relative;
}

.grid__spacer {
  position: relative;
}

.grid__row {
  position: absolute;
  inset-inline: 0;
  inset-block-start: 0;
  display: grid;
  gap: 2px;
}

.grid__tile {
  position: relative;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  background: var(--surface-raised);
  padding: 0;
  cursor: pointer;
}

.grid__tile img {
  inline-size: 100%;
  block-size: 100%;
  object-fit: cover;
  /* Starts transparent and fades to the resting state once decoded. */
  opacity: 0;
  transition:
    opacity var(--duration-slow) var(--ease-out),
    transform var(--duration-normal) var(--ease-out);
}

/* Dimmed at rest: a wall of violent imagery at full intensity is a lot, and the
   dimming also makes the hovered tile read as the active one. */
.grid__tile img[data-loaded='true'] {
  opacity: 0.72;
}

.grid__tile:hover img[data-loaded='true'],
.grid__tile:focus-visible img[data-loaded='true'] {
  opacity: 1;
  transform: scale(1.03);
}

.grid__fallback {
  display: grid;
  place-items: center;
  block-size: 100%;
  padding: var(--space-2xs);
  font-size: var(--text-2xs);
  color: var(--ink-faint);
  text-align: center;
  overflow: hidden;
}

.grid__empty {
  padding-block: var(--space-3xl);
  text-align: center;
  color: var(--ink-faint);
}

@media (prefers-reduced-motion: reduce) {
  .grid__tile:hover img[data-loaded='true'],
  .grid__tile:focus-visible img[data-loaded='true'] {
    transform: none;
  }

  /* The fade still happens — it is an opacity change, not movement — but
     instantly, so nothing is ever left invisible. */
  .grid__tile img {
    transition-duration: 1ms;
  }
}
</style>
