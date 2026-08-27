<script setup lang="ts">
/**
 * Search and filter toolbar. Ported from pe-vue's ArchiveToolbar.
 *
 * Two departures from the original, both deliberate:
 *
 * 1. The search field is always present rather than hidden behind a magnifying
 *    glass. The original's toggle saved a little space and cost a keystroke and
 *    a focus-management dance on every use; on a 30,000-item archive, search is
 *    the primary control, not a secondary one.
 *
 * 2. No icon font. pe-vue pulled in Font Awesome for six glyphs. These are
 *    inline SVG — no package, no webfont request, and they inherit currentColor.
 */
const archive = useArchive()
const { view, views } = useArchiveView()

const {
  searchTerm, binRange, shuffled, bookmarksOnly, count, total, hasActiveFilters, bookmarks,
} = archive

/** Debounced so a 30k-document MiniSearch query does not run per keystroke. */
const draft = ref(searchTerm.value)
let debounceTimer: ReturnType<typeof setTimeout> | undefined

watch(draft, (value) => {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => archive.setSearchTerm(value), 250)
})

// Keep the field in step when something else clears the filters.
watch(searchTerm, (value) => {
  if (value !== draft.value) draft.value = value
})

onBeforeUnmount(() => clearTimeout(debounceTimer))

const searchField = useTemplateRef<HTMLInputElement>('searchField')

function clearSearch(): void {
  draft.value = ''
  archive.setSearchTerm('')
  searchField.value?.focus()
}

const binModel = computed({
  get: () => binRange.value,
  set: (range: [number, number] | null) => archive.setBinRange(range),
})

const countLabel = computed(() => {
  const shown = count.value.toLocaleString()
  return hasActiveFilters.value
    ? `${shown} of ${total.value.toLocaleString()} clips`
    : `${shown} clips`
})
</script>

<template>
  <div class="toolbar">
    <Center measure="full">
      <div class="toolbar__inner">
        <!-- Search -->
        <div class="toolbar__search">
          <label
            for="archive-search"
            class="visually-hidden"
          >Search the archive</label>
          <input
            id="archive-search"
            ref="searchField"
            v-model="draft"
            type="search"
            class="toolbar__input"
            placeholder="Search word or term"
            autocomplete="off"
          >
          <button
            v-if="draft"
            type="button"
            class="toolbar__clear"
            aria-label="Clear search"
            @click="clearSearch"
          >
            <svg
              viewBox="0 0 16 16"
              width="14"
              height="14"
              aria-hidden="true"
            >
              <path
                d="M4 4l8 8M12 4l-8 8"
                stroke="currentColor"
                stroke-width="1.5"
                fill="none"
                stroke-linecap="round"
              />
            </svg>
          </button>
        </div>

        <!-- Named for how Nuxt registers it: components/archive/ArchiveBinSelector.vue
             resolves to <ArchiveBinSelector>, not <BinSelector>. -->
        <ArchiveBinSelector v-model="binModel" />

        <!-- Toggles -->
        <div class="toolbar__toggles">
          <button
            type="button"
            class="toolbar__toggle"
            :class="{ 'toolbar__toggle--on': shuffled }"
            :aria-pressed="shuffled"
            title="Shuffle the order"
            @click="archive.toggleShuffle()"
          >
            <svg
              viewBox="0 0 16 16"
              width="14"
              height="14"
              aria-hidden="true"
            >
              <path
                d="M1 4h3l3 8h4M1 12h3l3-8h4M11 2l3 2-3 2M11 10l3 2-3 2"
                stroke="currentColor"
                stroke-width="1.3"
                fill="none"
                stroke-linejoin="round"
                stroke-linecap="round"
              />
            </svg>
            <span>Shuffle</span>
          </button>

          <button
            type="button"
            class="toolbar__toggle"
            :class="{ 'toolbar__toggle--on': bookmarksOnly }"
            :aria-pressed="bookmarksOnly"
            title="Show only bookmarked clips"
            @click="archive.toggleBookmarksOnly()"
          >
            <svg
              viewBox="0 0 16 16"
              width="14"
              height="14"
              aria-hidden="true"
            >
              <path
                d="M4 2h8v12l-4-3-4 3z"
                stroke="currentColor"
                stroke-width="1.3"
                :fill="bookmarksOnly ? 'currentColor' : 'none'"
                stroke-linejoin="round"
              />
            </svg>
            <span>Saved<span v-if="bookmarks.length"> ({{ bookmarks.length }})</span></span>
          </button>

          <button
            v-if="hasActiveFilters"
            type="button"
            class="toolbar__toggle"
            @click="archive.clearFilters()"
          >
            Reset
          </button>
        </div>

        <p
          class="toolbar__count"
          aria-live="polite"
        >
          {{ countLabel }}
        </p>

        <!-- The view switcher sits with the filters because it is one: it
             changes how the same filtered set is presented. -->
        <div
          class="toolbar__views"
          role="group"
          aria-label="View"
        >
          <button
            v-for="option in views"
            :key="option.id"
            type="button"
            class="toolbar__view"
            :class="{ 'toolbar__view--on': view === option.id }"
            :aria-pressed="view === option.id"
            @click="view = option.id"
          >
            {{ option.label }}
          </button>
        </div>
      </div>
    </Center>
  </div>
</template>

<style scoped>
.toolbar {
  position: sticky;
  inset-block-start: 0;
  z-index: 10;
  border-block-end: 1px solid var(--rule);
  /* Opaque, not translucent: video scrolls underneath it. */
  background: var(--surface);
  padding-block: var(--space-s);
}

.toolbar__inner {
  display: flex;
  /*
   * One row, always.
   *
   * Wrapping made the bar jump between one and two rows as its contents
   * changed width — the clear button appearing, the count going from "30,651
   * clips" to "3,980 of 30,651 clips" — which read as the search field
   * randomly expanding. When there is genuinely not enough room the row
   * scrolls sideways instead of reflowing the page under the reader.
   */
  flex-wrap: nowrap;
  overflow-x: auto;
  overflow-y: hidden;
  gap: var(--space-l);
  align-items: center;
  /* Room for the focus ring on the first and last controls, which would
     otherwise be clipped by the scroll container. */
  padding-inline: 2px;
  scrollbar-width: none;
}

.toolbar__inner::-webkit-scrollbar {
  display: none;
}

/* Nothing in the bar may wrap internally or the row grows taller. */
.toolbar__inner > * {
  flex: none;
}

.toolbar__search {
  position: relative;
  /*
   * Fixed width — neither grows nor shrinks.
   *
   * Anything elastic here resizes as you type, because the result count beside
   * it changes length ("30,651 clips" → "3,980 of 30,651 clips") and the flex
   * line redistributes. That is what read as the field randomly expanding. If
   * the row runs out of room it scrolls; the search box stays put.
   */
  flex: 0 0 auto;
  inline-size: min(20rem, 40vw);
}

.toolbar__input {
  inline-size: 100%;
  background: var(--surface-raised);
  border: 1px solid var(--rule-strong);
  padding: var(--space-2xs) var(--space-xl) var(--space-2xs) var(--space-s);
  font-size: var(--text-sm);
  color: var(--ink);
}

.toolbar__input::placeholder {
  color: var(--ink-faint);
}

/* Safari draws its own clear affordance on type=search; ours is the one that
   is keyboard reachable and matches the design. */
.toolbar__input::-webkit-search-cancel-button {
  appearance: none;
}

.toolbar__clear {
  position: absolute;
  inset-block-start: 50%;
  inset-inline-end: var(--space-2xs);
  transform: translateY(-50%);
  padding: var(--space-2xs);
  color: var(--ink-faint);
}

.toolbar__clear:hover {
  color: var(--ink);
}

.toolbar__toggles {
  display: flex;
  flex-wrap: nowrap;
  gap: var(--space-2xs);
}

.toolbar__toggle {
  display: inline-flex;
  gap: var(--space-2xs);
  align-items: center;
  border: 1px solid var(--rule);
  background: var(--surface-raised);
  padding: var(--space-2xs) var(--space-s);
  font-size: var(--text-2xs);
  letter-spacing: var(--tracking-wide);
  text-transform: uppercase;
  color: var(--ink-faint);
  transition:
    color var(--duration-quick) var(--ease-out),
    border-color var(--duration-quick) var(--ease-out);
}

.toolbar__toggle:hover {
  color: var(--ink);
  border-color: var(--rule-strong);
}

.toolbar__toggle--on {
  color: var(--accent);
  border-color: var(--accent);
}

.toolbar__views {
  display: flex;
  gap: 1px;
}

.toolbar__view {
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

.toolbar__view:hover {
  color: var(--ink);
  border-color: var(--rule-strong);
}

.toolbar__view--on {
  color: var(--accent);
  border-color: var(--accent);
}

/* Fixed width so the row does not shift when the count changes length. */
.toolbar__count {
  margin-inline-start: auto;
  min-inline-size: 11rem;
  text-align: end;
  font-size: var(--text-2xs);
  letter-spacing: var(--tracking-wide);
  text-transform: uppercase;
  color: var(--ink-faint);
  white-space: nowrap;
}
</style>
