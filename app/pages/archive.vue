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

const advisoryAccepted = useState('archive:advisoryAccepted', () => false)

onMounted(async () => {
  archive.loadBookmarks()
  await archive.load()
})
</script>

<template>
  <div class="archive">
    <!--
      The advisory comes before the archive, not alongside it. This is material
      documenting violence; someone should be able to decide not to see it
      before it starts playing. Phase 4 made block_advisory a first-class type
      for the same reason.
    -->
    <section
      v-if="!advisoryAccepted"
      class="gate"
    >
      <Center>
        <Stack space="m">
          <h1>The Archive</h1>

          <p class="gate__lede">
            Over 30,000 clips excerpted from around 800 sources. The material is documented
            recordings of actual events.
          </p>

          <aside class="gate__advisory">
            <p>
              This archive contains depictions of war, its aftermath, death, injury, state and
              interpersonal violence, ecological catastrophe, and cruelty to people and animals.
              Clips play automatically as you scroll.
            </p>
            <p>
              <NuxtLink to="/disclaimers">
                The full advisory and the list of depicted content
              </NuxtLink>
              is on the disclaimers page.
            </p>
          </aside>

          <Cluster space="s">
            <button
              type="button"
              class="gate__enter"
              @click="advisoryAccepted = true"
            >
              Enter the archive
            </button>
            <NuxtLink
              to="/"
              class="gate__leave"
            >
              Not now
            </NuxtLink>
          </Cluster>
        </Stack>
      </Center>
    </section>

    <template v-else>
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
          class="archive__feed"
        >
          <ArchiveFeed :ids="archive.displayedIds.value" />
        </div>

        <ArchiveGrid
          v-else-if="view === 'grid'"
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
    </template>
  </div>
</template>

<style scoped>
.gate {
  /* Extra at the top for the floating header, which overlays this. */
  padding-block: var(--space-4xl) var(--space-3xl);
}

.gate__lede {
  font-size: var(--text-md);
  line-height: var(--leading-snug);
  color: var(--ink-muted);
}

.gate__advisory {
  border-inline-start: 2px solid var(--accent);
  padding-inline-start: var(--space-l);
  color: var(--ink-muted);
}

.gate__advisory p + p {
  margin-block-start: var(--space-s);
}

.gate__enter {
  background: var(--accent);
  color: var(--ink-inverse);
  padding: var(--space-xs) var(--space-l);
  font-weight: var(--weight-medium);
}

.gate__leave {
  padding: var(--space-xs) var(--space-s);
  font-size: var(--text-sm);
  color: var(--ink-muted);
  text-decoration: none;
}

.gate__leave:hover {
  color: var(--ink);
}

.notice {
  /* The column is flush so the grid can reach the edges; text still needs
     the gutter back, or it runs into the window edge. */
  padding-inline: var(--space-gutter);
  padding-block: var(--space-s);
  font-size: var(--text-xs);
  color: var(--ink-faint);
}

.notice--warn {
  color: var(--accent);
}

/*
 * Full-bleed, and as tall as what is left of the window.
 *
 * 100svh rather than 100vh so mobile browser chrome does not push the bottom of
 * the galaxy under the address bar. The subtraction is the header plus the
 * sticky toolbar above it.
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
  block-size: 100svh;
}

.archive__feed {
  /* The feed is a fixed-width column of clips, centred, like the original. */
  max-inline-size: 46rem;
  margin-inline: auto;
  /* Clearance for the floating header, which opens at the top-left. */
  padding-block-start: var(--space-4xl);
}
</style>
