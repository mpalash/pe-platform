import type { Ref } from 'vue'
import type { ArchiveItem } from '~~/shared/utils/archive'
import type { SessionCue } from '~~/shared/utils/sessions'

/**
 * The archive clip that was on screen in a session, at the playhead.
 *
 * Only for experience-log sessions — for an archive clip this is inert and
 * `title` stays null. The cues are fetched the first time the video plays or
 * is seeked, not on mount: a feed renders dozens of players, and a session
 * nobody plays should cost nothing.
 *
 * Tracked on `timeupdate` (while playing) and `seeked` (a jump while paused),
 * so the title follows the playhead either way. The lookup is a binary search
 * over the cues; `timeupdate` fires several times a second.
 */
export function useSessionCues(
  item: Readonly<Ref<ArchiveItem>>,
  video: Readonly<Ref<HTMLVideoElement | null>>,
) {
  const title = ref<string | null>(null)
  let cues: SessionCue[] | null = null
  let loading: Promise<void> | null = null
  let loadedFor: string | null = null

  function load(): Promise<void> {
    const current = item.value
    if (current.kind !== 'session') return Promise.resolve()
    if (loadedFor === current.id) return loading ?? Promise.resolve()

    loadedFor = current.id
    cues = null
    loading = $fetch<SessionCue[]>(`/api/experience-logs/${encodeURIComponent(current.id)}/cues`)
      .then((result) => {
        // Stepped to another session while this was in flight: discard.
        if (loadedFor === current.id) cues = result
      })
      .catch(() => {
        // No cues is a missing caption, not a broken player.
        if (loadedFor === current.id) cues = []
      })
    return loading
  }

  async function update(): Promise<void> {
    const el = video.value
    if (!el || item.value.kind !== 'session') return
    await load()
    title.value = cues ? cueAt(cues, el.currentTime) : null
  }

  // A different item in the same player (the modal steps) starts clean.
  watch(() => item.value.id, () => {
    title.value = null
    cues = null
    loadedFor = null
  })

  return { title, update }
}
