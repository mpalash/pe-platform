/**
 * Site identity, SEO/OG defaults and navigation, fetched once per page load.
 *
 * The shared `key` is what makes it once: the header, the layout and any page
 * that wants the defaults all call this, and Nuxt de-duplicates them into a
 * single request whose payload is reused on the client after hydration.
 */
import type { SiteSettings } from '~~/server/api/content/settings.get'

export function useSiteSettings() {
  return useFetch<SiteSettings>('/api/content/settings', {
    key: 'site-settings',
    // A site that renders without a name is worse than one that renders with a
    // placeholder, so there is always an object here rather than null.
    default: (): SiteSettings => ({
      site_name: 'purgatory EDIT',
      tagline: null,
      default_seo_title: null,
      default_seo_description: null,
      default_og_image: null,
      og_site_name: null,
      twitter_card: 'summary_large_image',
      nav_links: [],
    }),
  })
}
