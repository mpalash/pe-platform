<script setup lang="ts">
/**
 * The archive browser.
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

const archive = useArchive()
const media = useMediaConfigured()
const selection = useArchiveSelection()
const { view } = useArchiveView()

const advisory = useArchiveAdvisory()

/*
 * Traffic for this page is an ordinary Umami pageview. This adds the one thing
 * a pageview cannot say: how long anyone actually looked. It stands in for
 * per-clip play events, which the feed's autoplay would make meaningless.
 * (ADR-006)
 */
useArchiveDwell()

onMounted(async () => {
  archive.loadBookmarks()
  await archive.load()
})
</script>

<template>
  <div class="archive">
    <!--
      The archive renders and loads WHILE the advisory is up, which is the
      point of making the advisory a modal: the dataset, the thumbnails and the
      first clips are all in flight while it is being read, so accepting costs
      no wait.

      `inert` is what makes that safe. It removes the whole subtree from the tab
      order and the accessibility tree, so nothing behind the warning can be
      reached by keyboard or read by a screen reader before it is accepted —
      the blur only handles the visual half of that.

      Nothing PLAYS in the meantime either: useActivePlayer refuses to claim a
      clip until the advisory is accepted.
    -->
    <div
      class="archive__content"
      :inert="!advisory.accepted.value"
    >
      <ArchiveToolbar />

      <Center
        measure="full"
        flush
      >
        <!--
          No media-origin banner. Serving from S3 is still wrong for anything
          deployed, so the warning stays where it belongs: usePlaybackSource
          logs it to the console on every load, and the .env comment says it.
          A permanent banner over the archive taught readers to ignore it.
        -->
        <p
          v-if="!media.configured"
          class="notice"
        >
          Media is not configured, so clips will not play. Search and filtering still work.
        </p>

        <p
          v-if="archive.loading.value"
          class="notice"
        >
          Loading the archive…
        </p>
        <p
          v-else-if="archive.error.value"
          class="notice notice--warn"
        >
          {{ archive.error.value }}
        </p>

        <div
          v-if="view === 'feed'"
          key="feed"
          class="archive__feed"
        >
          <ArchiveFeed :ids="archive.displayedIds.value" />
        </div>

        <!--
          Keyed, and it matters. Without keys Vue patches this position in place
          when the view changes rather than replacing it, so switching Feed →
          Grid left the grid mounted inside the leftover `.archive__feed`
          wrapper — inheriting its 46rem column and rendering four narrow
          columns in the middle of a 2048px window instead of running edge to
          edge.
        -->
        <ArchiveGrid
          v-else-if="view === 'grid'"
          key="grid"
          :ids="archive.displayedIds.value"
        />
      </Center>

      <!--
        The galaxy sits OUTSIDE the centred column: it is a view of the whole
        archive and wants every pixel, so it spans the window and fills the
        height left under the header and toolbar.

        Client-only because WebGL exists only in the browser, and mounted only
        while it is the visible view — leaving it behind another tab would hold
        a GPU context and keep rendering.
      -->
      <ClientOnly v-if="view === 'galaxy'">
        <ArchiveGalaxy
          class="archive__galaxy"
          @pick="selection.open($event)"
        />
      </ClientOnly>

      <ArchiveModalPlayer
        v-if="selection.item.value"
        :item="selection.item.value"
        :has-prev="selection.hasPrev.value"
        :has-next="selection.hasNext.value"
        @close="selection.close()"
        @prev="selection.prev()"
        @next="selection.next()"
      />
    </div>

    <ClientOnly>
      <ArchiveAdvisoryModal v-if="!advisory.accepted.value" />
    </ClientOnly>
  </div>
</template>

<style scoped>
/*
 * The advisory used to be a section here that replaced the archive. It is a
 * modal now (ArchiveAdvisoryModal), so its styles moved with it — leaving the
 * gate rules behind would be dead CSS that looks load-bearing.
 */

.archive__galaxy {
  /*
   * The full window. Both the header and the toolbar float over the archive
   * now rather than sitting above it, so there is no chrome height to subtract
   * — the galaxy gets every pixel, which is what it always wanted.
   *
   * 100svh rather than 100vh so mobile browser chrome does not push the bottom
   * of the galaxy out of reach behind the address bar.
   */
  /* Minus the announcement strip, which is 0 when none is running. */
  block-size: calc(100svh - var(--banner-h, 0px));
}

.archive__feed {
  /* The feed is a fixed-width column of clips, centred, like the original. */
  max-inline-size: 46rem;
  margin-inline: auto;
  /* Clearance for the floating header, which opens at the top-left. */
  padding-block-start: calc(var(--space-4xl) + var(--banner-h, 0px));
}
</style>
