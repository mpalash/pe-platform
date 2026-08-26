/**
 * `useState`, but it survives a reload.
 *
 * Nuxt's `useState` is per-request state — shared across components, gone on
 * the next page load. That is right for most things and wrong for a viewing
 * preference: someone who chose the grid did not choose it for one page view.
 *
 * SSR-safe: the server renders the default, and the stored value is adopted on
 * mount. That produces a brief flash of the default rather than a hydration
 * mismatch, which is the better of the two failures.
 */
export function usePersistentState<T>(key: string, fallback: () => T): Ref<T> {
  const state = useState<T>(key, fallback)
  const storageKey = `pe:${key}`

  if (import.meta.client) {
    // `onMounted` would miss composables called outside a component, and this
    // runs once per key because useState memoises the initialiser.
    const stored = readStored<T>(storageKey)
    if (stored !== undefined) state.value = stored

    watch(state, (value) => {
      try {
        localStorage.setItem(storageKey, JSON.stringify(value))
      }
      catch {
        // Private browsing, quota, disabled storage — none worth breaking over.
      }
    }, { deep: true })
  }

  return state
}

function readStored<T>(key: string): T | undefined {
  try {
    const raw = localStorage.getItem(key)
    return raw === null ? undefined : (JSON.parse(raw) as T)
  }
  catch {
    return undefined
  }
}
