/**
 * How much room the announcement banner is taking at the top of the viewport.
 *
 * Three things have to clear it and none of them can see the component: the
 * draggable panels (whose top clamp is computed in JS), the framed content
 * pages, and the archive's full-height views. So the banner publishes its
 * height once, here, and everything else reads it.
 *
 * Zero when there is no banner, which is the common case — nothing pays for
 * this until an announcement is actually running.
 */
export function useSiteBanner() {
  const height = useState('banner:height', () => 0)

  /**
   * Mirrored onto the document element so CSS can use it too. Layout that can
   * be done in CSS should be, and passing this into every stylesheet through a
   * prop would be worse than one custom property.
   */
  function setHeight(value: number): void {
    height.value = value
    if (import.meta.client) {
      document.documentElement.style.setProperty('--banner-h', `${value}px`)
      // The draggable panels re-clamp on this. An event rather than a watched
      // ref because they cannot reach Nuxt state — see useDraggable.
      window.dispatchEvent(new Event('pe:banner-resize'))
    }
  }

  return { height, setHeight }
}
