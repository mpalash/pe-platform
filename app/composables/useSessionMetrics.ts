import type { Ref } from 'vue'
import type { ArchiveItem } from '~~/shared/utils/archive'
import type { SessionMetrics } from '~~/shared/utils/sessions'

/**
 * The headset's readings over a session, for ArchiveSessionGraph.
 *
 * Only for experience-log sessions — for an archive clip this is inert and
 * `metrics` stays null. Fetched on the first `load()`, which the players call
 * when the video plays or is seeked, like the cues: a feed renders dozens of
 * players, and a session nobody plays should cost nothing.
 */
export function useSessionMetrics(item: Readonly<Ref<ArchiveItem>>) {
  const metrics = shallowRef<SessionMetrics | null>(null)
  let loadedFor: string | null = null

  function load(): void {
    const current = item.value
    if (current.kind !== 'session' || loadedFor === current.id) return

    loadedFor = current.id
    $fetch<SessionMetrics>(`/api/experience-logs/${encodeURIComponent(current.id)}/metrics`)
      .then((result) => {
        // Stepped to another session while this was in flight: discard.
        if (loadedFor === current.id) metrics.value = result
      })
      .catch(() => {
        // No readings is an empty graph, not a broken player. Not retried:
        // load() runs on every timeupdate, and a failing route would be asked
        // four times a second.
      })
  }

  // A different item in the same player (the modal steps) starts clean.
  watch(() => item.value.id, () => {
    metrics.value = null
    loadedFor = null
  })

  return { metrics, load }
}
