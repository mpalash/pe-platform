/**
 * The content warning shown over the archive.
 *
 * Its own route rather than part of `/api/content/settings`, because only one
 * page needs it and the settings response is fetched on every page render —
 * folding an advisory nobody else reads into it would make every page pay for
 * the archive.
 *
 * Every field has a fallback. The warning is the one piece of copy on this site
 * that must never render empty: an archive of depicted violence with a blank
 * advisory over it is worse than one with no advisory at all, because the gate
 * still appears and still asks for consent to nothing.
 */
export interface ArchiveAdvisory {
  title: string
  lede: string | null
  body: string
  detail: string | null
  detail_label: string
  accept_label: string
  decline_label: string
  decline_path: string
}

/**
 * Used when Directus has nothing to say. Deliberately the real warning rather
 * than a placeholder — see above.
 */
const FALLBACK: ArchiveAdvisory = {
  title: 'Before you enter',
  lede: null,
  body:
    '<p>This archive contains depictions of war, its aftermath, death, injury, state and '
    + 'interpersonal violence, ecological catastrophe, and cruelty to people and animals. '
    + 'Clips play automatically as you scroll.</p>',
  detail: null,
  detail_label: 'The full list of depicted content',
  accept_label: 'Enter the archive',
  decline_label: 'Not now',
  decline_path: '/',
}

export default defineEventHandler(async (): Promise<ArchiveAdvisory> => {
  const record = (await readDirectusSingleton('archive_advisory')) ?? {}

  return {
    title: str(record['title']) ?? FALLBACK.title,
    lede: str(record['lede']),
    body: str(record['body']) ?? FALLBACK.body,
    detail: str(record['detail']),
    detail_label: str(record['detail_label']) ?? FALLBACK.detail_label,
    accept_label: str(record['accept_label']) ?? FALLBACK.accept_label,
    decline_label: str(record['decline_label']) ?? FALLBACK.decline_label,
    decline_path: str(record['decline_path']) ?? FALLBACK.decline_path,
  }
})

/** Directus returns '' for a cleared field; that is absent, not a value. */
function str(value: unknown): string | null {
  const text = typeof value === 'string' ? value.trim() : ''
  return text === '' ? null : text
}
