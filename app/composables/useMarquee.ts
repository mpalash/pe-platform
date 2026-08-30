/**
 * The mechanics of a seamless scrolling row, shared by the two things that
 * need one: the supporters block and the announcement banner.
 *
 * Extracted rather than copied because the non-obvious parts — how many copies
 * the track needs, and how far one "loop" actually is — are exactly the parts
 * that rot when duplicated. Get the copy count wrong and the track runs out
 * mid-scroll, leaving a visible gap before it snaps back.
 */
export interface MarqueeOptions {
  /** The scrolling window. Its width sets how many copies are needed. */
  viewport: Ref<HTMLElement | null>
  /** One copy of the content. Repeated until the track overflows twice over. */
  group: Ref<HTMLElement | null>
  /** Drives the duration, so adding an item does not speed everything up. */
  count: Ref<number>
  speed: Ref<string | null | undefined>
  direction?: Ref<string | null | undefined>
}

export function useMarquee(options: MarqueeOptions) {
  /**
   * How many copies of the content the track holds.
   *
   * Two is only enough when one copy is already wider than the viewport. With
   * three or four items on a wide screen it is not, so the copies are measured
   * and repeated until the track is at least twice the viewport — the extra
   * copy keeps a full screen of content ahead of the seam.
   */
  const repeats = ref(2)

  function measure(): void {
    const viewportWidth = options.viewport.value?.getBoundingClientRect().width ?? 0
    const groupWidth = options.group.value?.getBoundingClientRect().width ?? 0

    if (viewportWidth <= 0 || groupWidth <= 0) return

    repeats.value = Math.max(2, Math.ceil((viewportWidth * 2) / groupWidth) + 1)
  }

  let resizeObserver: ResizeObserver | null = null

  onMounted(() => {
    measure()
    if (options.viewport.value) {
      resizeObserver = new ResizeObserver(() => measure())
      resizeObserver.observe(options.viewport.value)
    }
  })

  onBeforeUnmount(() => resizeObserver?.disconnect())

  // Re-measure when the content itself changes, not only when the box does.
  watch(options.count, () => nextTick(measure))

  /**
   * Duration scales with the item count so the pixels-per-second stays roughly
   * constant — otherwise adding an item silently speeds the whole thing up.
   */
  const duration = computed(() => {
    const perItem = { slow: 4.5, medium: 3, fast: 1.8 }[options.speed.value ?? 'slow'] ?? 4.5
    return `${Math.max(12, options.count.value * perItem)}s`
  })

  const reversed = computed(() => options.direction?.value === 'right')

  return { repeats, duration, reversed, measure }
}
