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
import { toDisplayName } from './archive'

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

/* ── Cues: which archive clip was showing, from filenames.csv ─────────────────
 *
 * A session's `filenames.csv` logs, row by row, the moment each archive clip
 * started showing in the headset: `subject;YYYY-MM-DD HH:MM:SS.ss;clip`. An
 * empty clip field is a gap between clips. Aligned to the recording by the
 * video's own start time, that becomes a list of cues the player can look up
 * as it plays or is seeked.
 *
 * The subject column is the participant's name and is DROPPED here — a cue is
 * a time and a title, nothing else. See server/api/experience-logs.
 */

export interface SessionCue {
  /** Seconds into the video. */
  at: number
  /** The clip on screen from `at`, or null for a gap. */
  title: string | null
}

/** "Clip Name Comp 105.mp4_HAP.mov" → "Clip Name Comp 105". */
export function cueTitle(filename: string): string {
  return toDisplayName(filename.trim().replace(/_HAP\.mov$/i, ''))
}

/**
 * "YYYY-MM-DD HH:MM:SS.ss" → a count of wall-clock seconds, for subtracting one
 * stamp from another. `Date.UTC` is used only to count days — it applies no
 * time zone, so both stamps stay the venue-local times they were written as
 * (hard rule 10). Not `new Date(string)`, which would read them as the
 * viewer's local time.
 */
function wallSeconds(stamp: string): number | null {
  const m = stamp.match(/(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)/)
  if (!m) return null
  const day = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 1000
  return day + Number(m[4]) * 3600 + Number(m[5]) * 60 + Number(m[6])
}

/**
 * Parses filenames.csv into cues relative to the start of the video.
 *
 * `recorded` is the video's start as written in its filename. Rows before it
 * belong to an earlier session — one headset logged into a single file for
 * eight hours on the opening night — and are dropped, as are rows past
 * `duration`. When the recording has no time of day (one filename lost it),
 * the first row is taken as the start: the CSV begins within seconds of the
 * video everywhere it can be checked.
 */
export function parseCues(csv: string, recorded: string | null, duration: number): SessionCue[] {
  const rows = csv.split(/\r?\n/)
    .map(line => line.split(';'))
    .map(([, stamp = '', clip = '']) => ({ t: wallSeconds(stamp), clip }))
    .filter((row): row is { t: number, clip: string } => row.t !== null)

  const start = (recorded && /\d{2}:\d{2}/.test(recorded) ? wallSeconds(`${recorded}.00`) : null)
    ?? rows[0]?.t
  if (start === undefined || start === null) return []

  const cues: SessionCue[] = []
  for (const row of rows) {
    const at = Math.round((row.t - start) * 100) / 100
    if (at < 0 || at > duration) continue
    const title = row.clip.trim() ? cueTitle(row.clip) : null
    // Consecutive rows naming the same clip are one cue.
    if (cues.length && cues.at(-1)!.title === title) continue
    cues.push({ at, title })
  }
  return cues
}

/** The cue in force at `time` — the last one at or before it. Binary search: runs on every timeupdate. */
export function cueAt(cues: readonly SessionCue[], time: number): string | null {
  let lo = 0
  let hi = cues.length - 1
  let found = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (cues[mid]!.at <= time) {
      found = mid
      lo = mid + 1
    }
    else hi = mid - 1
  }
  return found >= 0 ? cues[found]!.title : null
}
