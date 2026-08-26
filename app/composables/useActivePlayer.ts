/**
 * Which clip is playing, and whether sound is on.
 *
 * Exactly one clip plays at a time. pe-vue kept this in a Vuex module for the
 * same reason: without a single owner, every player independently decides it is
 * visible and you get six soundtracks at once.
 */
export function useActivePlayer() {
  const currentId = useState<string | null>('archive:activeClip', () => null)

  /**
   * Muted by default, and deliberately not persisted. Browsers block unmuted
   * autoplay anyway, and an archive of violent material should not start making
   * noise because of a choice someone made on a previous visit.
   */
  const muted = useState<boolean>('archive:muted', () => true)

  function claim(id: string): void {
    currentId.value = id
  }

  function release(): void {
    currentId.value = null
  }

  function toggleMuted(): void {
    muted.value = !muted.value
  }

  return { currentId, muted, claim, release, toggleMuted }
}
