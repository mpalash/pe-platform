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

  const advisory = useArchiveAdvisory()

  /**
   * Refused while the content warning is still up.
   *
   * The archive now loads BEHIND the advisory so it is ready the moment someone
   * accepts, and this is the line between loading and showing. Without it the
   * feed would start playing documented violence behind a blur, which is
   * exactly the thing the warning is asking about.
   *
   * Enforced here rather than in the feed so that any future caller inherits
   * it — a second player that forgot would reintroduce the problem silently.
   */
  function claim(id: string): void {
    if (!advisory.accepted.value) return
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
