/**
 * Whether any floating panel is currently being dragged.
 *
 * The galaxy watches this and freezes while it is true. Dragging a panel over
 * a 30,000-instance WebGL scene competes with it for the main thread, and the
 * panel is the thing the pointer is attached to — it is the one that has to
 * stay smooth. Freezing the simulation for the length of a drag costs nothing
 * visible and gives the drag the frame budget back.
 *
 * A COUNTER rather than a boolean. Two panels can be dragged at once (a touch
 * on each), and with a boolean the first one to be released would clear the
 * flag while the second was still moving. The count only reaches zero when
 * every drag has genuinely ended.
 */
export function useChromeDrag() {
  const count = useState('chrome:dragCount', () => 0)

  return {
    dragging: computed(() => count.value > 0),
    begin: () => { count.value++ },
    /*
     * Clamped at zero. A pointercancel following a pointerup — which happens
     * when a drag is interrupted by the OS — would otherwise drive the count
     * negative and leave `dragging` stuck false for the next real drag.
     */
    end: () => { count.value = Math.max(0, count.value - 1) },
  }
}
