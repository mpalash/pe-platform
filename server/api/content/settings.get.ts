/**
 * Site identity, SEO/OG defaults, and the primary navigation, in one response.
 *
 * One route rather than two because every page needs both on every render, and
 * two round trips to fetch a dozen fields is a waste. They stay separate
 * *collections* in Directus — different editing rhythms — but they arrive here
 * together.
 *
 * Read through the service token like all Directus access, so the singletons
 * need no public read permission and the token stays server-side. Caching is
 * left to the `/api/**` route rule, as with every other content route — a
 * second cache layer here would just double the staleness window.
 *
 * Missing singletons are not an error. A database that has had the schema
 * applied but never opened in the admin has empty records, and the site has to
 * render anyway — so everything below degrades to a default rather than a 500.
 */
export interface NavLink {
  label: string
  path: string
  external: boolean
}

export interface SiteSettings {
  site_name: string
  tagline: string | null
  default_seo_title: string | null
  default_seo_description: string | null
  default_og_image: string | null
  og_site_name: string | null
  twitter_card: string
  nav_links: NavLink[]
}

/** Used when Directus has nothing to say, so the site still has a name. */
const FALLBACK_SITE_NAME = 'purgatory EDIT'

export default defineEventHandler(async (): Promise<SiteSettings> => {
  // Settled independently: an empty `navigation` should not blank the site
  // name, and vice versa.
  const [settings, navigation] = await Promise.all([
    readDirectusSingleton('site_settings'),
    readDirectusSingleton('navigation'),
  ])

  const record = (settings ?? {}) as Record<string, unknown>
  const nav = (navigation ?? {}) as Record<string, unknown>

  const raw = Array.isArray(nav['links']) ? nav['links'] as Record<string, unknown>[] : []

  return {
    site_name: str(record['site_name']) ?? FALLBACK_SITE_NAME,
    tagline: str(record['tagline']),
    default_seo_title: str(record['default_seo_title']),
    default_seo_description: str(record['default_seo_description']),
    default_og_image: str(record['default_og_image']),
    og_site_name: str(record['og_site_name']),
    twitter_card: str(record['twitter_card']) ?? 'summary_large_image',
    nav_links: raw
      // A half-entered row — a label with no path — would render a link to
      // nowhere, so it is dropped rather than shown broken.
      .filter(link => str(link['label']) && str(link['path']))
      .map(link => ({
        label: String(link['label']),
        path: String(link['path']),
        external: Boolean(link['external']),
      })),
  }
})

/** Directus returns '' for a cleared field; that is absent, not a value. */
function str(value: unknown): string | null {
  const text = typeof value === 'string' ? value.trim() : ''
  return text === '' ? null : text
}
