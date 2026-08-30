/**
 * Makes a floating panel draggable, and keeps it inside the window.
 *
 * Shared by the site header and the archive toolbar, which are both chrome
 * that floats over the content rather than displacing it. Two panels doing
 * this independently would drift apart the moment one of them was tweaked.
 *
 * Three things this owns, none of which are optional:
 *
 *   1. **Containment.** A panel dragged off-screen is a panel you cannot get
 *      back without clearing storage. Every position — dragged, restored from
 *      a previous visit, or left alone while the window was resized — is
 *      clamped into the viewport with `MARGIN` to spare.
 *
 *   2. **Keyboard operation.** Hard rule 11: every interactive element is
 *      operable by keyboard. A pointer-only drag would make position an
 *      affordance available to mice alone, so the handle also takes arrow
 *      keys (and Home to snap back to where it started).
 *
 *   3. **Persistence.** Where you put a panel is a preference, not a
 *      per-pageview accident, so it survives navigation and reload.
 *
 * Positions are stored as top-left pixel offsets rather than as a corner
 * anchor. Anchoring is nicer under resize, but it needs a notion of "which
 * corner is this nearest", and the clamping below covers the same ground
 * without the guesswork.
 */

export interface DraggableOptions {
  /** Storage key. Distinct per panel; shared keys would fight each other. */
  id: string
  /** Where the panel sits before anyone moves it. */
  initial: { x: number, y: number }
  /** Keyboard step, in pixels. Shift moves by one for fine placement. */
  step?: number
}

/** Clearance kept between a panel and the window edge, in pixels. */
export const DRAG_MARGIN = 24

export function useDraggable(options: DraggableOptions) {
  const step = options.step ?? 16

  const position = usePersistentState(`drag:${options.id}`, () => ({ ...options.initial }))
  const panel = ref<HTMLElement | null>(null)
  const dragging = ref(false)

  // Announced globally so expensive things can stand down for the duration —
  // the galaxy freezes its simulation while a panel is moving.
  const chrome = useChromeDrag()

  /**
   * How tall the announcement banner is, read from the CSS variable it
   * publishes rather than from its composable.
   *
   * `useState` is not usable here: the components that drag (SiteHeader above
   * all) `await` before calling this, and after an await the Nuxt context is
   * gone — `useState` then hands back a DETACHED ref that silently reads 0
   * for ever. The symptom was a header that clamped to 24px and sat under the
   * banner while `--banner-h` was plainly 28px.
   *
   * The custom property has no such requirement and is the same number.
   */
  function bannerHeight(): number {
    if (!import.meta.client) return 0
    const raw = getComputedStyle(document.documentElement).getPropertyValue('--banner-h')
    return Number.parseFloat(raw) || 0
  }

  /**
   * Clamps to the viewport. Reads the panel's real size each time rather than
   * caching it — these panels change height when a menu opens or the clip
   * count changes, and a stale height lets the bottom edge escape.
   */
  function clamp(x: number, y: number): { x: number, y: number } {
    if (!import.meta.client) return { x, y }

    const el = panel.value
    const width = el?.offsetWidth ?? 0
    const height = el?.offsetHeight ?? 0

    /*
     * The announcement banner reserves a strip at the very top, so the upper
     * bound is below it rather than at DRAG_MARGIN. Without this the header
     * panel opens underneath the banner and can be dragged behind it — the one
     * place on screen where a floating panel is genuinely stuck.
     *
     * Zero whenever no announcement is running, which is most of the time.
     */
    const top = DRAG_MARGIN + bannerHeight()

    const maxX = Math.max(DRAG_MARGIN, window.innerWidth - width - DRAG_MARGIN)
    const maxY = Math.max(top, window.innerHeight - height - DRAG_MARGIN)

    return {
      x: Math.min(Math.max(x, DRAG_MARGIN), maxX),
      y: Math.min(Math.max(y, top), maxY),
    }
  }

  function moveTo(x: number, y: number): void {
    position.value = clamp(x, y)
  }

  /* ── pointer ─────────────────────────────────────────────────────────── */

  let originX = 0
  let originY = 0
  let startX = 0
  let startY = 0

  function onPointerDown(event: PointerEvent): void {
    // Left button (or touch/pen) only — a right-click drag is a context menu.
    if (event.button !== 0) return

    dragging.value = true
    chrome.begin()
    originX = event.clientX
    originY = event.clientY
    startX = position.value.x
    startY = position.value.y

    // Pointer capture keeps the drag alive when the cursor outruns the handle,
    // which it will, because the panel lags the pointer at the clamp edges.
    ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
    event.preventDefault()
  }

  function onPointerMove(event: PointerEvent): void {
    if (!dragging.value) return
    moveTo(startX + (event.clientX - originX), startY + (event.clientY - originY))
  }

  function onPointerUp(event: PointerEvent): void {
    if (!dragging.value) return
    dragging.value = false
    chrome.end()
    ;(event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId)
  }

  /* ── keyboard ────────────────────────────────────────────────────────── */

  function onKeyDown(event: KeyboardEvent): void {
    const distance = event.shiftKey ? 1 : step
    const { x, y } = position.value

    switch (event.key) {
      case 'ArrowLeft':
        moveTo(x - distance, y)
        break
      case 'ArrowRight':
        moveTo(x + distance, y)
        break
      case 'ArrowUp':
        moveTo(x, y - distance)
        break
      case 'ArrowDown':
        moveTo(x, y + distance)
        break
      case 'Home':
        moveTo(options.initial.x, options.initial.y)
        break
      default:
        return
    }

    // Only reached when a key was handled, so arrow keys still scroll the page
    // when focus is anywhere else.
    event.preventDefault()
  }

  /* ── containment ─────────────────────────────────────────────────────── */

  function reclamp(): void {
    moveTo(position.value.x, position.value.y)
  }

  onMounted(() => {
    // The stored position was clamped against a window that may have been a
    // different size, and the panel has only just been measured — so re-clamp
    // once the element exists rather than trusting what came out of storage.
    nextTick(reclamp)
    window.addEventListener('resize', reclamp, { passive: true })

    // An announcement arriving after mount changes where "the top" is. The
    // banner announces that with an event, for the same context reason.
    window.addEventListener('pe:banner-resize', reclamp)
  })

  onBeforeUnmount(() => {
    window.removeEventListener('resize', reclamp)
    window.removeEventListener('pe:banner-resize', reclamp)
    // Unmounting mid-drag — a route change under the pointer — would otherwise
    // leave the global count raised and the galaxy frozen for ever.
    if (dragging.value) chrome.end()
  })

  /**
   * Position as a transform, and the reason it eases.
   *
   * `usePersistentState` renders the DEFAULT on the server — localStorage does
   * not exist there — and adopts the stored value on mount. A panel you left at
   * the bottom right therefore paints at the top left for one frame and then
   * jumps. The mount re-clamp can move it again on top of that, if the window
   * has been resized since the last visit.
   *
   * Easing that transition turns both corrections into a single deliberate
   * glide to where you left the panel, which reads as the page settling rather
   * than as a layout bug. `--drag-ease` is set to 0 while a pointer drag is in
   * progress: a transition there would make the panel lag the cursor, which is
   * the one place this must not happen.
   *
   * `translate3d` rather than `inset`, because only the former animates on the
   * compositor — transitioning `inset` relayouts the panel every frame.
   */
  const style = computed(() => ({
    'transform': `translate3d(${position.value.x}px, ${position.value.y}px, 0)`,
    '--drag-ease': dragging.value ? '0ms' : undefined,
  }))

  /** Spread onto the drag handle. Keeps the wiring in one place. */
  const handleProps = computed(() => ({
    onPointerdown: onPointerDown,
    onPointermove: onPointerMove,
    onPointerup: onPointerUp,
    onPointercancel: onPointerUp,
    onKeydown: onKeyDown,
  }))

  return { panel, position, dragging, style, handleProps, reclamp }
}
