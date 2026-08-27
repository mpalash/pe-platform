<script setup lang="ts">
/**
 * Every source the archive was excerpted from.
 *
 * Ported from pe-vue's SrcIndexView, with one substantive change: pe-vue loaded
 * the whole 18MB archive into the browser to derive this list at runtime. It is
 * derived at build time instead (scripts/build-sources.ts) into a 208KB file,
 * so the page renders on the server and can be indexed. For an attributions
 * list that is the point — attribution nobody can find is not attribution.
 *
 * A route rather than a Directus page, for the same reason the archive is one:
 * its content is the dataset, not something anybody authors. Editing it in the
 * admin would mean editing a copy that the next archive export contradicts.
 */
import type { ArchiveSource } from '~~/shared/utils/archive'

const { data: sources } = await useFetch<ArchiveSource[]>('/api/archive/sources', {
  key: 'archive-sources',
  default: () => [],
})

useSeoMeta({
  title: 'Source Index',
  description:
    'Every source the archive was excerpted from — films, broadcasts, reports and '
    + 'recordings, with attribution and links where they exist.',
})

/*
 * No total is stated in prose, deliberately. The archive page says the clips
 * come from "around 800 sources", while this list has 1,282 distinct srcName
 * values — the difference is that some works appear under several names, with
 * per-clip identifiers leaking into the source field (see the entries ending in
 * long numeric suffixes). Printing a figure next to that contradiction would
 * just make one of the two pages wrong. The count below is what the data
 * actually contains, and it is labelled as such.
 */

/**
 * Only the count is announced, not the list. A screen reader meeting 1,282
 * items wants to know the size of what it has arrived at before it starts.
 */
const countLabel = computed(() =>
  `${sources.value.length.toLocaleString()} sources`,
)
</script>

<template>
  <article class="content-page">
    <Center
      as="header"
      class="page-header"
    >
      <Stack space="s">
        <h1>Source Index</h1>
        <p class="page-header__summary">
          Every source the archive was excerpted from — films, broadcasts, reports and
          recordings, listed alphabetically with attribution and a link where one exists.
        </p>
        <p class="sources__count">
          {{ countLabel }}
        </p>
      </Stack>
    </Center>

    <Center as="section">
      <!--
        An ordered list, as in the original. The numbering is the useful part:
        it makes the index citable — "source 417" is a reference someone can
        actually follow up.
      -->
      <ol class="sources">
        <li
          v-for="source in sources"
          :key="source.srcName"
          class="sources__item"
        >
          <a
            v-if="source.srcURL"
            :href="source.srcURL"
            class="sources__name"
            target="_blank"
            rel="noopener noreferrer"
          >{{ source.srcName }}</a>
          <span
            v-else
            class="sources__name"
          >{{ source.srcName }}</span>

          <span
            v-if="source.srcAuthor"
            class="sources__meta"
          >, {{ source.srcAuthor }}</span>
          <span
            v-if="source.srcLocation"
            class="sources__meta"
          > ({{ source.srcLocation }})</span>
        </li>
      </ol>
    </Center>
  </article>
</template>

<style scoped>
.page-header {
  padding-block-end: var(--space-xl);
}

.page-header__summary {
  font-size: var(--text-md);
  line-height: var(--leading-snug);
  color: var(--ink-muted);
}

.sources__count {
  font-size: var(--text-2xs);
  letter-spacing: var(--tracking-wide);
  text-transform: uppercase;
  color: var(--ink-faint);
}

.sources {
  /* Tabular numbering, outside the text, so wrapped lines align under the
     first word rather than under the number. */
  padding-inline-start: 3.5rem;
  font-size: var(--text-sm);
  line-height: var(--leading-snug);
}

.sources__item {
  margin-block-end: var(--space-xs);
  /* Long broadcast titles run to two or three lines; breaking anywhere is
     better than a horizontal scrollbar on a list of 1,282 items. */
  overflow-wrap: anywhere;
}

.sources__item::marker {
  color: var(--ink-faint);
  font-size: var(--text-2xs);
  font-variant-numeric: tabular-nums;
}

.sources__name {
  color: var(--ink);
}

/* Unlinked sources are the majority of what has no URL — they should not look
   like broken links, so only the anchors carry the underline. */
a.sources__name {
  color: var(--accent);
}

.sources__meta {
  color: var(--ink-muted);
}
</style>
