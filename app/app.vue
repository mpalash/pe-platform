<script setup lang="ts">
/**
 * Site-wide head defaults, sourced from the `site_settings` singleton.
 *
 * These are defaults in the strict sense: `useSeoMeta` in a page overrides any
 * of them, and pages that set nothing still emit a complete, sensible set of
 * tags. Doing it here rather than per page means a new page cannot ship
 * without OG tags by omission.
 *
 * `titleTemplate` is a function so a page whose title is already the site name
 * — the home page — does not come out as "purgatory EDIT | purgatory EDIT".
 */
const { data: settings } = await useSiteSettings()

const siteName = computed(() => settings.value?.site_name ?? 'purgatory EDIT')

const ogImage = computed(() => {
  const id = settings.value?.default_og_image
  if (!id) return undefined
  // Directus serves assets by id; the URL is public because the share card has
  // to be fetchable by crawlers that will never hold a token.
  return `${useRuntimeConfig().public.directusUrl}/assets/${id}`
})

useHead({
  titleTemplate: title => (!title || title === siteName.value ? siteName.value : `${title} — ${siteName.value}`),
  htmlAttrs: { lang: 'en' },
})

useSeoMeta({
  description: () => settings.value?.default_seo_description ?? settings.value?.tagline ?? '',
  ogSiteName: () => settings.value?.og_site_name ?? siteName.value,
  ogType: 'website',
  ogTitle: () => settings.value?.default_seo_title ?? siteName.value,
  ogDescription: () => settings.value?.default_seo_description ?? settings.value?.tagline ?? '',
  ogImage: () => ogImage.value,
  twitterCard: () => (settings.value?.twitter_card ?? 'summary_large_image') as 'summary_large_image' | 'summary',
  twitterTitle: () => settings.value?.default_seo_title ?? siteName.value,
  twitterDescription: () => settings.value?.default_seo_description ?? settings.value?.tagline ?? '',
  twitterImage: () => ogImage.value,
})
</script>

<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>
