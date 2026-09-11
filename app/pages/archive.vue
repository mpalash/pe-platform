<script setup lang="ts">
/**
 * The archive.
 *
 * Client-rendered, per the plan's rendering table: it is interactive, it is
 * public, and its dataset is a static 18MB file that has no business being
 * fetched during SSR.
 *
 * PUBLIC — no sign-in, no gating, no signed URLs (hard rule 4).
 */
definePageMeta({ layout: 'default' })

useSeoMeta({
  title: 'The Archive',
  description:
    'Over 30,000 clips excerpted from around 800 sources — an archive of moving images '
    + 'representative of histories of violence.',
})

/*
 * Everything else — toolbar, feed, grid, galaxy, modal, advisory — is the
 * shared browser, which the experience logs render too. See ArchiveBrowser.
 * This page's only job beyond its SEO is to say which collection it is.
 */
provideArchiveCollection('archive')
</script>

<template>
  <ArchiveBrowser />
</template>
