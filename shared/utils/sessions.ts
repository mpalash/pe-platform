/**
 * Shaping the experience-log sessions into archive items.
 *
 * The source is `x_logs/index.json` in the bucket, written by
 * scripts/xlog/finalize.sh. Pure and framework-free so the tests can import it.
 *
 * ── What is deliberately dropped ──────────────────────────────────────────
 *
 * The index carries the original filenames, and those carry participants'
 * names ("…_Vincenzo_opening night.mov"). None of that reaches an item. A
 * session is labelled by when it was recorded, and the paths to its headset
 * CSVs are not passed on either — both are decisions for a person to take
 * deliberately, not defaults this function should make for them.
 */
import type { ArchiveItem } from './archive'

/** One entry in x_logs/index.json. Only the fields read here are typed. */
export interface SessionIndexEntry {
  slug: string
  recorded: string | null
  duration: number
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/**
 * "2025-01-14 12:26:02" → "14 January 2025, 12:26".
 *
 * Parsed by hand, never through `Date`. The value is venue-local wall-clock
 * time with no zone recorded (hard rule 10; the venue's zone is open question
 * Q1), and `new Date()` would read it as the VIEWER's local time — shifting
 * every session by however far the reader is from Berlin, and on the wrong
 * side of midnight for some of them.
 *
 * One source filename lost its time ("VR-14._mitchel"), so its entry carries a
 * date alone and gets a date alone here.
 */
export function sessionLabel(recorded: string | null | undefined): string {
  const match = recorded?.match(/^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2}))?/)
  if (!match) return 'Undated session'

  const [, year, month, day, hour, minute] = match
  const date = `${Number(day)} ${MONTHS[Number(month) - 1]} ${year}`
  return hour ? `${date}, ${hour}:${minute}` : date
}

/** 3010.77 → "50 minutes". Sessions run 1–55 minutes; seconds would be noise. */
export function sessionLength(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60))
  return minutes === 1 ? '1 minute' : `${minutes} minutes`
}

export function shapeSession(entry: SessionIndexEntry): ArchiveItem {
  return {
    id: entry.slug,
    // The slug is the session's identity in the bucket; only
    // usePlaybackSource turns it into a URL (hard rule 5).
    filename: entry.slug,
    kind: 'session',
    name: sessionLabel(entry.recorded),
    srcName: '',
    srcAuthor: '',
    srcLocation: '',
    srcType: 'Experience log',
    srcURL: '',
    bin: '',
    topics: [],
    keywords: [],
    description: sessionLength(entry.duration),
  }
}

/** In recording order. An undated entry sorts first rather than vanishing. */
export function shapeSessions(entries: SessionIndexEntry[]): ArchiveItem[] {
  return [...entries]
    .sort((a, b) => (a.recorded ?? '').localeCompare(b.recorded ?? ''))
    .map(shapeSession)
}
