/**
 * The announcement marquee shown across the top of every page.
 *
 * Expiry is applied HERE rather than in the browser. An entry with a `until`
 * date drops out on its own once that date has passed, which is the whole point
 * of a banner advertising *upcoming* events — otherwise it quietly becomes a
 * list of things that already happened, and nobody notices until someone asks
 * why the site is advertising last year's show.
 *
 * Doing it server-side also means the expired entry never reaches the client,
 * so a long-lived tab cannot keep showing it.
 */
export interface AnnouncementItem {
  text: string
  url: string | null
}

export interface Announcement {
  enabled: boolean
  speed: string
  items: AnnouncementItem[]
}

export default defineEventHandler(async (): Promise<Announcement> => {
  const record = (await readDirectusSingleton('announcement')) ?? {}

  const raw = Array.isArray(record['items']) ? record['items'] as Record<string, unknown>[] : []

  /*
   * Compared at day granularity, in UTC. A show "until 12 February" should be
   * announced for the whole of the 12th wherever the reader is, so the cutoff
   * is the end of that day rather than the instant it is parsed.
   */
  const today = new Date().toISOString().slice(0, 10)

  const items = raw
    // A blank line would scroll past as an empty gap.
    .filter(item => typeof item['text'] === 'string' && item['text'].trim() !== '')
    .filter((item) => {
      const until = item['until']
      if (typeof until !== 'string' || until === '') return true
      return until.slice(0, 10) >= today
    })
    .map(item => ({
      text: String(item['text']).trim(),
      url: typeof item['url'] === 'string' && item['url'].trim() !== ''
        ? item['url'].trim()
        : null,
    }))

  return {
    // An empty list hides the banner whatever the switch says — a banner with
    // nothing in it is a bar of blank space across every page.
    enabled: record['enabled'] !== false && items.length > 0,
    speed: typeof record['speed'] === 'string' && record['speed'] ? record['speed'] : 'slow',
    items,
  }
})
