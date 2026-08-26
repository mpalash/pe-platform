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

        <div class="archive__feed">
          <ArchiveFeed :ids="archive.displayedIds.value" />
        </div>
      </Center>
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
</style>
