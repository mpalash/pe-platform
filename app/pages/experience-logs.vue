<script setup lang="ts">
/**
 * The experience logs: a recording of each participant session, from
 * `x_logs/` in the bucket (scripts/xlog).
 *
 * The same browser as the archive, deliberately — see ArchiveBrowser. What
 * differs is declared in shared/utils/collections.ts: no galaxy view, no
 * intensity selector, and sessions in the order they were recorded.
 *
 * Sessions are labelled by date and time, never by participant. The names are
 * in the source filenames and are dropped on the server; see
 * server/api/experience-logs.get.ts.
 */
definePageMeta({ layout: 'default' })

// Which collection this page is. See useArchiveCollection.
provideArchiveCollection('sessions')

useSeoMeta({
  title: 'Experience Logs',
  description:
    'Recordings of individual sessions in the purgatory EDIT experience, '
    + 'as the participant saw it.',
})
</script>

<template>
  <ArchiveBrowser />
</template>
