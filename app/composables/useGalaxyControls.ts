/**
 * The galaxy's display controls, lifted out of the galaxy component.
 *
 * They live here because the toolbar owns them now and the canvas obeys them,
 * and those are two different components. Prop-drilling would mean threading
 * four values through the archive page for one view's benefit; shared state is
 * what this actually is.
 *
 * `useState`, not `usePersistentState`: these are viewing controls for a
 * session, and the defaults below are deliberate (see the galaxy component on
 * why depth 35 is load-bearing). Remembering a depth someone dragged to 200
 * once, months later, would silently undo that.
 */
export function useGalaxyControls() {
  return {
    /** Freezes the simulation clock. The scene still renders. */
    paused: useState('galaxy:paused', () => false),
    /**
     * How close a tile must be for its thumbnail to show, in world units.
     *
     * Also gates which tiles are worth loading at all. The camera rests 55
     * units out, so this has to stay in the tens — see CAM_REST_DISTANCE.
     */
    depthRange: useState('galaxy:depthRange', () => 35),
    fogStrength: useState('galaxy:fogStrength', () => 1.10),
    thumbnails: useState('galaxy:thumbnails', () => true),
  }
}
