<script setup lang="ts">
/**
 * A small floating video that plays clips from the archive.
 *
 * Muted and autoplaying, which is also the only way a browser will let it
 * start: an unmuted autoplay is blocked outright. It advances to another random
 * clip when one ends rather than looping a single clip, so it stays a window
 * onto the archive rather than a decoration that happens to move.
 *
 * Draggable, and that is the only way out of its way: whether it appears at
 * all is an editorial decision, made per page in Directus, not a per-visitor
 * one. It sits over the content on every page that wants it, and anything that
 * sits over content on every page has to be movable.
 *
 * Media goes through `usePlaybackSource` like every other player — a `.mp4`
 * literal anywhere in here would be a bug (hard rule 5).
 */
import type { AmbientClip } from '~~/server/api/archive/ambient-pool.get'

/**
 * The player's size, declared once and used for both the CSS and the initial
 * bottom-left position. Two copies of this number drift, and the symptom is a
 * player that opens slightly off the corner.
 */
const WIDTH = 240
const HEIGHT = 135 + 24 // 16:9 video, plus the control strip above it

const ambient = useAmbientVideo()

/*
 * Plain `$fetch` in onMounted, not `useFetch`.
 *
 * `useFetch` exists to coordinate SSR and hydration, and neither applies here:
 * the component is inside <ClientOnly>, so it mounts after hydration is over.
 * In that position `useFetch` never runs — there is no async context left for
 * it to attach to — and the pool silently stays empty, which shows up as a
 * player that renders nothing at all.
 *
 * An await at the top level does not fix it either: that makes this an async
 * setup component, and an async component under <ClientOnly> has no Suspense
 * boundary in the layout to resolve against, so it never mounts.
 */
const pool = ref<AmbientClip[]>([])

/**
 * Reduced motion is respected by not starting on its own.
 *
 * A video that begins playing without being asked is precisely the kind of
 * motion this preference exists for, and the repo's convention is a
 * `prefers-reduced-motion` guard on every animation. The player still appears
 * and still plays — it waits to be asked.
 */
const reducedMotion = ref(false)

const clip = ref<AmbientClip | null>(null)
const video = useTemplateRef<HTMLVideoElement>('video')
const playing = ref(false)

/** 0–1. Drives the progress bar and nothing else. */
const progress = ref(0)

function onTimeUpdate(): void {
  const el = video.value
  if (!el || !Number.isFinite(el.duration) || el.duration <= 0) return

  progress.value = el.currentTime / el.duration

  // Recorded every tick so an unmount mid-clip — routing through /archive —
  // has somewhere to resume from without needing its own teardown hook.
  if (clip.value) ambient.resume.value = { id: clip.value.id, time: el.currentTime }
}

const source = computed(() => usePlaybackSource(clip.value?.filename))

/** A different clip from the one showing, so "next" always visibly changes. */
function pickClip(): void {
  const clips = pool.value
  if (clips.length === 0) return

  if (clips.length === 1) {
    clip.value = clips[0]!
    return
  }

  let next = clip.value

  while (next === clip.value || next?.id === clip.value?.id) {
    next = clips[Math.floor(Math.random() * clips.length)]!
  }

  clip.value = next
}

/**
 * `play()` rejects when autoplay is refused, and an unhandled rejection here
 * would be a console error on every page load. Refusal is a normal outcome —
 * some browsers block even muted autoplay under a strict setting — so it is
 * caught and the player simply waits for a click.
 */
async function start(): Promise<void> {
  const el = video.value
  if (!el) return

  try {
    await el.play()
    playing.value = true
  }
  catch {
    playing.value = false
  }
}

function toggle(): void {
  const el = video.value
  if (!el) return

  if (el.paused) void start()
  else {
    el.pause()
    playing.value = false
  }
}

/**
 * A clip that cannot load would otherwise stall the player permanently: `ended`
 * never fires for a source that 404s or fails to decode, so auto-next never
 * advances and the frame sits black until the page is reloaded. Treating an
 * error as the end of the clip skips it.
 */
function onError(): void {
  onEnded()
}

function onEnded(): void {
  progress.value = 0
  pickClip()
  // The source changed, so the element has to be told to load it before it
  // will play — this is the same trap the archive's modal player had.
  nextTick(() => {
    video.value?.load()
    if (!reducedMotion.value) void start()
  })
}

const { panel, style, handleProps, dragging } = useDraggable({
  id: 'ambient-video',
  // Bottom left. `window` is safe to read here because the component is
  // rendered inside <ClientOnly>, and useDraggable re-clamps on mount anyway.
  initial: {
    x: DRAG_MARGIN,
    y: Math.max(DRAG_MARGIN, window.innerHeight - HEIGHT - DRAG_MARGIN),
  },
})

onMounted(async () => {
  reducedMotion.value = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  try {
    pool.value = await $fetch<AmbientClip[]>('/api/archive/ambient-pool')
  }
  catch {
    // The pool is a build artefact; if it is missing the route says so in its
    // own error. Here it just means no player, which is the right outcome —
    // better than an empty frame on every page.
    return
  }

  /*
   * Resume the clip that was playing before, if there was one.
   *
   * This is the whole of "keeps playing across pages" for the case that
   * actually breaks. Between ordinary pages the component is never unmounted
   * and nothing here runs; it is the round trip through /archive — or any page
   * with the toggle off — that lands back here, and without this it would
   * restart on a different clip.
   */
  const previous = ambient.resume.value
  const remembered = previous && pool.value.find(item => item.id === previous.id)

  if (remembered) clip.value = remembered
  else pickClip()

  await nextTick()

  if (remembered && previous) {
    const el = video.value
    if (el) {
      // Seeking before any data has loaded is discarded, so it waits for the
      // metadata that carries `duration` and the seekable range.
      const seek = (): void => {
        el.currentTime = previous.time
      }
      if (el.readyState >= 1) seek()
      else el.addEventListener('loadedmetadata', seek, { once: true })
    }
  }

  if (!reducedMotion.value) void start()
})
</script>

<template>
  <aside
    v-if="source.src"
    ref="panel"
    class="ambient drag-panel"
    :class="{ 'ambient--dragging': dragging }"
    :style="{ ...style, inlineSize: `${WIDTH}px` }"
    aria-label="Archive clips"
  >
    <div class="ambient__bar">
      <button
        type="button"
        class="ambient__handle"
        aria-label="Move the clip player. Use the arrow keys to reposition, Home to reset."
        v-bind="handleProps"
      >
        <svg
          viewBox="0 0 16 16"
          width="12"
          height="12"
          aria-hidden="true"
        >
          <g fill="currentColor">
            <circle
              cx="6"
              cy="4"
              r="1"
            />
            <circle
              cx="10"
              cy="4"
              r="1"
            />
            <circle
              cx="6"
              cy="8"
              r="1"
            />
            <circle
              cx="10"
              cy="8"
              r="1"
            />
            <circle
              cx="6"
              cy="12"
              r="1"
            />
            <circle
              cx="10"
              cy="12"
              r="1"
            />
          </g>
        </svg>
      </button>

      <button
        type="button"
        class="ambient__control"
        :aria-pressed="playing"
        @click="toggle"
      >
        {{ playing ? 'Pause' : 'Play' }}
      </button>

      <button
        type="button"
        class="ambient__control"
        @click="onEnded"
      >
        Next<span class="visually-hidden"> clip</span>
      </button>
    </div>

    <!--
      `muted` is not optional — an unmuted autoplay is refused by every browser.
      `playsinline` stops iOS taking the video fullscreen the moment it starts.
      No `controls`: the strip above is the control surface, and the native ones
      would cover a 240px frame entirely.
    -->
    <video
      ref="video"
      class="ambient__video"
      :src="source.src ?? undefined"
      :poster="source.poster ?? undefined"
      muted
      playsinline
      preload="metadata"
      :title="clip?.name"
      @ended="onEnded"
      @error="onError"
      @timeupdate="onTimeUpdate"
      @play="playing = true"
      @pause="playing = false"
    />

    <!--
      aria-hidden: it reports the same thing the <video> already does, it
      changes several times a second, and it cannot be interacted with — three
      good reasons not to put it in the accessibility tree.
    -->
    <div
      class="ambient__progress"
      aria-hidden="true"
    >
      <div
        class="ambient__progress-bar"
        :style="{ transform: `scaleX(${progress})` }"
      />
    </div>
  </aside>
</template>

<style scoped>
.ambient {
  z-index: 35;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--rule);
  background: color-mix(in srgb, var(--surface) 88%, transparent);
  backdrop-filter: blur(12px);
}

.ambient--dragging {
  border-color: var(--rule-strong);
  user-select: none;
}

.ambient__bar {
  display: flex;
  align-items: center;
  gap: var(--space-2xs);
  padding: var(--space-3xs) var(--space-2xs);
}

.ambient__handle {
  display: inline-flex;
  padding: 0;
  cursor: grab;
  color: var(--ink-faint);
  touch-action: none; /* or the browser scrolls instead of dragging */
}

.ambient--dragging .ambient__handle {
  cursor: grabbing;
}

.ambient__control {
  font-size: var(--text-3xs, var(--text-2xs));
  letter-spacing: var(--tracking-wide);
  text-transform: uppercase;
  color: var(--ink-faint);
}

.ambient__control:hover {
  color: var(--accent);
}

.ambient__progress {
  block-size: 2px;
  background: var(--rule);
  overflow: hidden;
}

.ambient__progress-bar {
  block-size: 100%;
  background: var(--accent);
  /*
   * scaleX from the left edge rather than animating `inline-size`: a transform
   * is a compositor operation, and this updates several times a second on
   * every page the player appears on.
   */
  transform-origin: left center;
  will-change: transform;
}

.ambient__video {
  display: block;
  inline-size: 100%;
  aspect-ratio: 16 / 9;
  object-fit: cover;
  background: var(--surface-sunken);
}
</style>
