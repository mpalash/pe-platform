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
  title: 'The Doomscroll Archive',
  description:
    'Over 30,000 clips excerpted from around 800 sources — an archive of moving images '
    + 'representative of histories of violence.',
})

const archive = useArchive()
const media = useMediaConfigured()
const selection = useArchiveSelection()

const advisoryAccepted = useState('archive:advisoryAccepted', () => false)

/**
 * Three ways to look at the same filtered set.
 *
 *   feed   — one clip at a time, playing. Reading.
 *   grid   — thumbnails, many at once. Scanning.
 *   galaxy — the whole archive as a shape. Browsing.
 *
 * The toolbar filters all three, so switching view keeps your search.
 * Persisted, because it is a preference rather than a per-visit choice.
 */
type ArchiveView = 'feed' | 'grid' | 'galaxy'
const view = usePersistentState<ArchiveView>('archive:view', () => 'feed')

const views: Array<{ id: ArchiveView, label: string }> = [
  { id: 'feed', label: 'Feed' },
  { id: 'grid', label: 'Grid' },
  { id: 'galaxy', label: 'Galaxy' },
]

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
          <h1>The Doomscroll Archive</h1>

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

      <Center measure="full">
        <p
          v-if="!media.configured"
          class="notice"
        >
          Media is not configured, so clips will not play. Metadata, search and filtering all
          work. Set <code>NUXT_PUBLIC_MEDIA_BASE</code> to a CloudFront distribution.
        </p>
        <p
          v-else-if="media.usingOriginFallback"
          class="notice notice--warn"
        >
          Serving video straight from S3, which is billed per view. Development only —
          set <code>NUXT_PUBLIC_MEDIA_BASE</code> before deploying.
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

        <div class="archive__views">
          <div
            class="archive__switch"
            role="group"
            aria-label="View"
          >
            <button
              v-for="option in views"
              :key="option.id"
              type="button"
              class="archive__view"
              :class="{ 'archive__view--on': view === option.id }"
              :aria-pressed="view === option.id"
              @click="view = option.id"
            >
              {{ option.label }}
            </button>
          </div>
        </div>

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

        <!--
          WebGL only exists in the browser, and the galaxy allocates a context
          the moment it mounts — so it is client-only and only mounted while it
          is the visible view. Leaving it mounted behind another tab would hold
          a GPU context and keep rendering.
        -->
        <ClientOnly v-else>
          <ArchiveGalaxy @pick="selection.open($event)" />
        </ClientOnly>
      </Center>

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
  padding-block: var(--space-3xl);
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
  padding-block: var(--space-s);
  font-size: var(--text-xs);
  color: var(--ink-faint);
}

.notice--warn {
  color: var(--accent);
}

.archive__feed {
  /* The feed is a fixed-width column of clips, centred, like the original. */
  max-inline-size: 46rem;
  margin-inline: auto;
  padding-block-start: var(--space-l);
}

.archive__views {
  display: flex;
  justify-content: flex-end;
  padding-block: var(--space-xs);
}

.archive__switch {
  display: flex;
  gap: 1px;
}

.archive__view {
  border: 1px solid var(--rule);
  padding: var(--space-2xs) var(--space-s);
  font-size: var(--text-2xs);
  letter-spacing: var(--tracking-wide);
  text-transform: uppercase;
  color: var(--ink-faint);
  transition:
    color var(--duration-quick) var(--ease-out),
    border-color var(--duration-quick) var(--ease-out);
}

.archive__view:hover {
  color: var(--ink);
  border-color: var(--rule-strong);
}

.archive__view--on {
  color: var(--accent);
  border-color: var(--accent);
}
</style>
