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

/**
 * The toolbar floats over the archive rather than sitting above it, for the
 * same reason the site header does: the grid and galaxy are views of the whole
 * archive and a bar across the top crops them. Floating means it can be in the
 * way, so it can also be moved.
 *
 * It opens at the bottom-left. Top-left is the site header's corner, and the
 * two panels overlapping on first load would look like a bug rather than a
 * layout. The y is resolved on the client because it depends on the window
 * height, which the server does not have — `useDraggable` re-clamps on mount,
 * so an approximate value here is corrected before it is ever painted.
 */
const { panel, style, handleProps, dragging, reclamp } = useDraggable({
  id: 'archive-toolbar',
  initial: { x: 24, y: 420 },
})

const collapsed = usePersistentState('archive:toolbarCollapsed', () => false)

// Collapsing changes the panel height, which can leave it hanging off the
// bottom of the window. Re-clamp once the new height exists.
watch(collapsed, () => nextTick(reclamp))

/*
 * The galaxy's controls live here rather than on the canvas.
 *
 * They are filters on what the archive shows, in the same sense the intensity
 * scale is, and having two separate control surfaces on the same screen — one
 * floating panel and one bar welded to the bottom of the canvas — made the
 * archive feel like two applications. Shown only for the galaxy, because that
 * is the only view they mean anything in.
 */
const galaxy = useGalaxyControls()

const countLabel = computed(() => {
  const shown = count.value.toLocaleString()
  return hasActiveFilters.value
    ? `${shown} of ${total.value.toLocaleString()} clips`
    : `${shown} clips`
})
</script>

<template>
  <div
    ref="panel"
    class="toolbar drag-panel"
    :class="{ 'toolbar--dragging': dragging }"
    :style="style"
  >
    <div class="toolbar__head">
      <button
        type="button"
        class="toolbar__handle"
        aria-label="Move the filter panel. Use the arrow keys to reposition, Home to reset."
        v-bind="handleProps"
      >
        <svg
          viewBox="0 0 16 16"
          width="12"
          height="12"
          aria-hidden="true"
        >
          <g fill="currentColor">
            <circle cx="6" cy="4" r="1" />
            <circle cx="10" cy="4" r="1" />
            <circle cx="6" cy="8" r="1" />
            <circle cx="10" cy="8" r="1" />
            <circle cx="6" cy="12" r="1" />
            <circle cx="10" cy="12" r="1" />
          </g>
        </svg>
        <span>Filters</span>
      </button>

      <button
        type="button"
        class="toolbar__collapse"
        :aria-expanded="!collapsed"
        aria-controls="archive-filters"
        @click="collapsed = !collapsed"
      >
        {{ collapsed ? 'Show' : 'Hide' }}
        <span class="visually-hidden"> the filter controls</span>
      </button>
    </div>

    <div
      v-show="!collapsed"
      id="archive-filters"
    >
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

        <!-- Galaxy-only display controls. `v-if` rather than `v-show`: the
             galaxy is unmounted in the other views, so these would be
             adjusting nothing. -->
        <div
          v-if="view === 'galaxy'"
          class="toolbar__galaxy"
        >
          <div class="toolbar__toggles">
            <button
              type="button"
              class="toolbar__toggle"
              :class="{ 'toolbar__toggle--on': galaxy.paused.value }"
              :aria-pressed="galaxy.paused.value"
              @click="galaxy.paused.value = !galaxy.paused.value"
            >
              {{ galaxy.paused.value ? 'Play' : 'Pause' }}
            </button>

            <button
              type="button"
              class="toolbar__toggle"
              :class="{ 'toolbar__toggle--on': galaxy.thumbnails.value }"
              :aria-pressed="galaxy.thumbnails.value"
              @click="galaxy.thumbnails.value = !galaxy.thumbnails.value"
            >
              Thumbnails
            </button>
          </div>

          <label class="toolbar__slider">
            <span>Depth <em>{{ galaxy.depthRange.value }}</em></span>
            <input
              v-model.number="galaxy.depthRange.value"
              type="range"
              min="20"
              max="200"
              step="5"
            >
          </label>

          <label class="toolbar__slider">
            <span>Fog <em>{{ galaxy.fogStrength.value.toFixed(2) }}</em></span>
            <input
              v-model.number="galaxy.fogStrength.value"
              type="range"
              min="0"
              max="1.5"
              step="0.05"
            >
          </label>
        </div>

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
    </div>
  </div>
</template>

<style scoped>
/*
 * A floating column, not a bar.
 *
 * Every control stacks vertically inside a fixed 240px, which is what makes
 * the panel readable at a glance and keeps it narrow enough to sit beside the
 * archive rather than over it. The old horizontal bar had to fight to stay on
 * one row — a fixed-width column has no row to overflow, so the whole
 * nowrap/scroll apparatus is gone.
 */
.toolbar {
  /* Positioning comes from `.drag-panel` in primitives.css. */
  z-index: 30;
  /* 240px, as specified — and `inline-size` too, not just a max, so the panel
     does not resize as the clip count changes length underneath it. */
  inline-size: 15rem;
  max-inline-size: 15rem;

  display: flex;
  flex-direction: column;
  gap: var(--space-s);

  padding: var(--space-s);
  border: 1px solid var(--rule);
  /* Translucent with a blur: video and the galaxy pass underneath, and an
     opaque slab this size would block too much of them. */
  background: color-mix(in srgb, var(--surface) 88%, transparent);
  backdrop-filter: blur(12px);

  /* The panel is taller than a phone once every filter is open. */
  max-block-size: calc(100dvh - 48px);
  overflow-y: auto;
  overscroll-behavior: contain;
}

.toolbar--dragging {
  border-color: var(--rule-strong);
  user-select: none;
}

.toolbar__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-s);
}

.toolbar__handle {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2xs);
  padding: 0;
  cursor: grab;
  font-size: var(--text-2xs);
  letter-spacing: var(--tracking-wide);
  text-transform: uppercase;
  color: var(--ink-faint);
  touch-action: none; /* or the browser scrolls instead of dragging */
}

.toolbar--dragging .toolbar__handle {
  cursor: grabbing;
}

.toolbar__handle:hover {
  color: var(--ink-muted);
}

.toolbar__collapse {
  font-size: var(--text-2xs);
  letter-spacing: var(--tracking-wide);
  text-transform: uppercase;
  color: var(--ink-muted);
}

.toolbar__collapse:hover {
  color: var(--accent);
}

.toolbar__inner {
  display: flex;
  flex-direction: column;
  gap: var(--space-m);
  /* Room for focus rings, which a tight container clips. */
  padding: 2px;
}

/* Controls fill the column rather than sizing to their content. */
.toolbar__inner > * {
  inline-size: 100%;
}

.toolbar__search {
  position: relative;
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
  flex-direction: column;
  gap: var(--space-2xs);
}

.toolbar__toggle {
  display: flex;
  gap: var(--space-2xs);
  align-items: center;
  inline-size: 100%;
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

/* Three equal segments across the column, so it reads as one control. */
.toolbar__views {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1px;
}

.toolbar__view {
  border: 1px solid var(--rule);
  padding: var(--space-2xs) var(--space-2xs);
  text-align: center;
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

/*
 * Set apart by a rule: these control how the galaxy DRAWS the set, where
 * everything above controls what is in it. Without the separation they read as
 * more filters.
 */
.toolbar__galaxy {
  display: flex;
  flex-direction: column;
  gap: var(--space-s);
  padding-block-start: var(--space-s);
  border-block-start: 1px solid var(--rule);
}

.toolbar__slider {
  display: flex;
  flex-direction: column;
  gap: var(--space-3xs);
  font-size: var(--text-2xs);
  letter-spacing: var(--tracking-wide);
  text-transform: uppercase;
  color: var(--ink-faint);
}

.toolbar__slider em {
  font-style: normal;
  color: var(--ink-muted);
  /* Tabular figures, so the label does not jitter as the value changes. */
  font-variant-numeric: tabular-nums;
}

.toolbar__slider input {
  inline-size: 100%;
  accent-color: var(--accent);
}

.toolbar__count {
  font-size: var(--text-2xs);
  letter-spacing: var(--tracking-wide);
  text-transform: uppercase;
  color: var(--ink-faint);
}
</style>
