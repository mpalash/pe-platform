<script setup lang="ts">
/**
 * The scrolling feed.
 *
 * pe-vue used `vue-recycle-scroller`. This is a hand-rolled window instead —
 * about forty lines — because the Vue 3 build of that package is still
 * pre-release, and a feed of fixed-height rows does not need a library.
 *
 * Virtualising is not optional: the archive is 30,000 clips, and mounting even
 * a fraction of them as <video> elements would exhaust the browser's media
 * decoder budget long before it ran out of memory.
 */
const props = withDefaults(defineProps<{
  ids: string[]
  /** Rows rendered beyond the viewport, above and below. */
  overscan?: number
}>(), {
  overscan: 2,
})

const archive = useArchive()
const active = useActivePlayer()

const viewport = useTemplateRef<HTMLElement>('viewport')

/**
 * Which clip plays is decided HERE, not by each clip.
 *
 * Each player used to claim playback itself from an IntersectionObserver, which
 * meant several could qualify at once and the winner was whichever observer
 * fired last. The feed is the only thing that knows where every clip is, so it
 * picks: nothing plays while you are scrolling, and when scrolling stops the
 * clip nearest the middle of the window starts.
 */
const SCROLL_IDLE_MS = 180

let idleTimer: ReturnType<typeof setTimeout> | undefined

function playCentremost(): void {
  const container = viewport.value
  if (!container) return

  const middle = window.innerHeight / 2
  let bestId: string | null = null
  let bestDistance = Infinity

  for (const row of container.querySelectorAll<HTMLElement>('[data-row]')) {
    const id = row.dataset['id']
    if (!id) continue

    const rect = row.getBoundingClientRect()

    // Ignore anything entirely off-screen: on a virtualised list the overscan
    // rows are real elements sitting above and below the viewport.
    if (rect.bottom < 0 || rect.top > window.innerHeight) continue

    const distance = Math.abs(rect.top + rect.height / 2 - middle)
    if (distance < bestDistance) {
      bestDistance = distance
      bestId = id
    }
  }

  if (bestId) active.claim(bestId)
  else active.release()
}

function onScrollSettle(): void {
  clearTimeout(idleTimer)
  idleTimer = setTimeout(playCentremost, SCROLL_IDLE_MS)
}

/**
 * Row height is measured rather than assumed — the metadata block wraps
 * differently at different widths, and a wrong constant shows up as drift
 * between the scrollbar and the content.
 */
const rowHeight = ref(520)
const viewportHeight = ref(0)
const scrollTop = ref(0)

const total = computed(() => props.ids.length)
const totalHeight = computed(() => total.value * rowHeight.value)

const range = computed(() => {
  if (rowHeight.value <= 0) return { start: 0, end: Math.min(total.value, 6) }

  const visible = Math.ceil(viewportHeight.value / rowHeight.value)
  const start = Math.max(0, Math.floor(scrollTop.value / rowHeight.value) - props.overscan)
  const end = Math.min(total.value, start + visible + props.overscan * 2)

  return { start, end }
})

const windowed = computed(() =>
  props.ids.slice(range.value.start, range.value.end).map((id, offset) => ({
    id,
    index: range.value.start + offset,
  })),
)

function onScroll(): void {
  scrollTop.value = window.scrollY - (viewport.value?.offsetTop ?? 0)

  // Everything stops while the feed is moving; the centremost clip starts again
  // once it settles.
  active.release()
  onScrollSettle()
}

function measure(): void {
  viewportHeight.value = window.innerHeight

  // Measure the first rendered row and adopt its height.
  const firstRow = viewport.value?.querySelector<HTMLElement>('[data-row]')
  if (firstRow) {
    const measured = firstRow.getBoundingClientRect().height
    if (measured > 0 && Math.abs(measured - rowHeight.value) > 1) {
      rowHeight.value = measured
    }
  }
}

let resizeObserver: ResizeObserver | null = null

onMounted(() => {
  measure()
  onScroll()

  window.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('resize', measure, { passive: true })

  // Start the first clip without needing a scroll to trigger it.
  onScrollSettle()

  // Row height changes with width; re-measure when the container does.
  if (viewport.value) {
    resizeObserver = new ResizeObserver(() => measure())
    resizeObserver.observe(viewport.value)
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('scroll', onScroll)
  window.removeEventListener('resize', measure)
  resizeObserver?.disconnect()
  clearTimeout(idleTimer)
  active.release()
})

// Jumping back to the top on a filter change is the correct behaviour: the
// old scroll offset means nothing against a different result set.
watch(() => props.ids, () => {
  scrollTop.value = 0
  active.release()
  if (import.meta.client) window.scrollTo({ top: 0, behavior: 'auto' })
  onScrollSettle()
})
</script>

<template>
  <div
    ref="viewport"
    class="feed"
  >
    <p
      v-if="total === 0"
      class="feed__empty"
    >
      Nothing matches those filters.
    </p>

    <div
      v-else
      class="feed__spacer"
      :style="{ blockSize: `${totalHeight}px` }"
    >
      <div
        v-for="row in windowed"
        :key="row.id"
        :data-id="row.id"
        data-row
        class="feed__row"
        :style="{ transform: `translateY(${row.index * rowHeight}px)` }"
      >
        <ArchivePlayer
          v-if="archive.getItem(row.id)"
          :item="archive.getItem(row.id)!"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.feed {
  position: relative;
}

.feed__spacer {
  position: relative;
}

.feed__row {
  position: absolute;
  inset-inline: 0;
  inset-block-start: 0;
  padding-block-end: var(--space-l);
}

.feed__empty {
  padding-block: var(--space-3xl);
  text-align: center;
  color: var(--ink-faint);
}
</style>
