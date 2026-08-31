<script setup lang="ts">
import type { ArchiveItem } from '~~/shared/utils/archive'

/**
 * Full-screen clip player. Ported from pe-vue's ModalVideoPlayer, and shared by
 * the grid and the galaxy.
 *
 * Built on a native <video> rather than video.js. The original pulled in
 * video.js plus its Vue wrapper — roughly 200KB — for play, pause, mute, seek
 * and fullscreen, all of which the element does itself. The custom controls
 * below are the same feature set the original drew over the top anyway.
 *
 * Dialog behaviour is the part worth getting right, because a modal that traps
 * a keyboard user is worse than no modal: Escape closes, focus moves in on open
 * and returns to the trigger on close, Tab is trapped inside, and background
 * scrolling is locked.
 */
const props = defineProps<{
  item: ArchiveItem
  /** True when there is somewhere to go. Hides the arrows at the ends. */
  hasPrev?: boolean
  hasNext?: boolean
}>()

const emit = defineEmits<{ close: [], prev: [], next: [] }>()

const archive = useArchive()
const { track } = useAnalytics()

/**
 * COMPUTED, not destructured at setup.
 *
 * `usePlaybackSource` returns plain strings. Calling it once and pulling `src`
 * out gives a value that never changes — so stepping to the next clip updated
 * the title and description (which read `item` reactively in the template) while
 * the <video> kept playing the first one. It looked like the metadata was
 * broken; it was the video that never moved.
 */
const source = computed(() => usePlaybackSource(props.item.filename))
const src = computed(() => source.value.src)
const poster = computed(() => source.value.poster)

const dialog = useTemplateRef<HTMLElement>('dialog')
const videoEl = useTemplateRef<HTMLVideoElement>('videoEl')

const isPlaying = ref(false)
const muted = ref(false)
const progress = ref(0)
const currentTime = ref(0)
const duration = ref(0)
const isFullscreen = ref(false)

/**
 * Auto-next: when a clip ends, advance. Persisted, because it is a viewing
 * mode rather than a per-clip choice — someone who wants to sit and watch the
 * archive should not have to re-enable it every time they open a clip.
 */
const autoNext = usePersistentState('archive:autoNext', () => false)

const isBookmarked = computed(() => archive.isBookmarked(props.item.id))

function togglePlay(): void {
  const el = videoEl.value
  if (!el) return
  if (el.paused) {
    void el.play().catch(() => {
      isPlaying.value = false
    })
  }
  else {
    el.pause()
  }
}

function toggleMute(): void {
  muted.value = !muted.value
  if (videoEl.value) videoEl.value.muted = muted.value
}

function onTimeUpdate(): void {
  const el = videoEl.value
  if (!el || !Number.isFinite(el.duration)) return

  currentTime.value = el.currentTime
  duration.value = el.duration
  progress.value = (el.currentTime / el.duration) * 100
}

function seek(event: Event): void {
  const el = videoEl.value
  const input = event.target as HTMLInputElement
  if (!el || !Number.isFinite(el.duration)) return
  el.currentTime = (Number(input.value) / 100) * el.duration
}

function onEnded(): void {
  isPlaying.value = false
  if (autoNext.value && props.hasNext) emit('next')
}

async function toggleFullscreen(): Promise<void> {
  if (!dialog.value) return

  if (document.fullscreenElement) await document.exitFullscreen()
  else await dialog.value.requestFullscreen().catch(() => {})
}

function onFullscreenChange(): void {
  isFullscreen.value = Boolean(document.fullscreenElement)
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return '0:00'
  const minutes = Math.floor(seconds / 60)
  const rest = Math.floor(seconds % 60)
  return `${minutes}:${String(rest).padStart(2, '0')}`
}

/* ── dialog mechanics ──────────────────────────────────────────────────── */

const FOCUSABLE = 'a[href], button:not([disabled]), input, [tabindex]:not([tabindex="-1"])'

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.stopPropagation()
    emit('close')
    return
  }

  if (event.key === 'ArrowLeft' && props.hasPrev) {
    emit('prev')
    return
  }

  if (event.key === 'ArrowRight' && props.hasNext) {
    emit('next')
    return
  }

  // Space plays and pauses, unless the focus is somewhere that needs it.
  if (event.key === ' ' && !(event.target as HTMLElement).matches('button, input')) {
    event.preventDefault()
    togglePlay()
    return
  }

  if (event.key !== 'Tab' || !dialog.value) return

  // Trap: wrap focus at both ends rather than letting it escape to the page
  // behind, which is still there and still scrollable to a screen reader.
  const focusable = [...dialog.value.querySelectorAll<HTMLElement>(FOCUSABLE)]
    .filter(el => el.offsetParent !== null)

  if (focusable.length === 0) return

  const first = focusable[0]!
  const last = focusable.at(-1)!

  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  }
  else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}

let previouslyFocused: HTMLElement | null = null

onMounted(() => {
  previouslyFocused = document.activeElement as HTMLElement | null

  /*
   * Bound to the DOCUMENT, not only to the dialog.
   *
   * The template binding alone only fires while focus is inside the modal, so
   * Escape stopped working the moment focus went anywhere else — clicking a
   * floating panel, or the browser moving it on its own. The modal is still
   * covering the screen at that point, and a cover you cannot dismiss from the
   * keyboard is the failure this was supposed to prevent.
   */
  document.addEventListener('keydown', onKeydown)

  // Lock the page behind. Without this the background scrolls under the modal,
  // which on a feed of autoplaying video is genuinely disorienting.
  document.body.style.overflow = 'hidden'
  document.addEventListener('fullscreenchange', onFullscreenChange)

  nextTick(() => dialog.value?.focus())
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown)
  document.body.style.overflow = ''
  document.removeEventListener('fullscreenchange', onFullscreenChange)
  if (document.fullscreenElement) void document.exitFullscreen().catch(() => {})
  previouslyFocused?.focus?.()
})

// Moving to another clip should start it, not leave a paused frame.
watch(() => props.item.id, () => {
  progress.value = 0
  currentTime.value = 0
  duration.value = 0

  nextTick(() => {
    const el = videoEl.value
    if (!el) return

    /*
     * `load()` is required. Changing the `src` attribute on an element that is
     * already playing does not reliably re-fetch — the browser keeps decoding
     * the old stream until told to start over.
     */
    el.load()
    el.play().catch(() => {
      isPlaying.value = false
    })
  })
})
</script>

<template>
  <div
    ref="dialog"
    class="modal"
    role="dialog"
    aria-modal="true"
    :aria-label="item.name"
    tabindex="-1"
  >
    <div
      class="modal__scrim scrim"
      @click="emit('close')"
    />

    <div class="modal__panel frosted">
      <div class="modal__main">
        <div class="modal__stage">
          <video
            v-if="src"
            ref="videoEl"
            :src="src"
            :poster="poster ?? undefined"
            autoplay
            playsinline
            preload="metadata"
            class="modal__video"
            @timeupdate="onTimeUpdate"
            @play="isPlaying = true"
            @pause="isPlaying = false"
            @ended="onEnded"
            @click="togglePlay"
          />
          <p
            v-else
            class="modal__unavailable"
          >
            Media is not configured, so this clip cannot play.
          </p>

          <button
            type="button"
            class="modal__close"
            aria-label="Close"
            @click="emit('close')"
          >
            <svg
              viewBox="0 0 16 16"
              width="16"
              height="16"
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

          <button
            v-if="hasPrev"
            type="button"
            class="modal__step modal__step--prev"
            aria-label="Previous clip"
            @click="emit('prev')"
          >
            ‹
          </button>
          <button
            v-if="hasNext"
            type="button"
            class="modal__step modal__step--next"
            aria-label="Next clip"
            @click="emit('next')"
          >
            ›
          </button>
        </div>

        <div
          v-if="src"
          class="modal__controls"
        >
          <button
            type="button"
            class="modal__control"
            :aria-label="isPlaying ? 'Pause' : 'Play'"
            @click="togglePlay"
          >
            <span aria-hidden="true">{{ isPlaying ? '❚❚' : '▶' }}</span>
          </button>

          <label
            class="visually-hidden"
            :for="`modal-seek-${item.id}`"
          >Seek</label>
          <input
            :id="`modal-seek-${item.id}`"
            class="modal__seek"
            type="range"
            min="0"
            max="100"
            step="0.1"
            :value="progress"
            @input="seek"
          >

          <span class="modal__time">
            {{ formatTime(currentTime) }} / {{ formatTime(duration) }}
          </span>

          <button
            type="button"
            class="modal__control"
            :aria-pressed="muted"
            :aria-label="muted ? 'Unmute' : 'Mute'"
            @click="toggleMute"
          >
            <span aria-hidden="true">{{ muted ? '🔇' : '🔊' }}</span>
          </button>

          <button
            type="button"
            class="modal__control"
            :class="{ 'modal__control--on': isBookmarked }"
            :aria-pressed="isBookmarked"
            :aria-label="isBookmarked ? 'Remove from saved' : 'Save this clip'"
            @click="archive.toggleBookmark(item.id)"
          >
            <svg
              viewBox="0 0 16 16"
              width="13"
              height="13"
              aria-hidden="true"
            >
              <path
                d="M4 2h8v12l-4-3-4 3z"
                stroke="currentColor"
                stroke-width="1.3"
                :fill="isBookmarked ? 'currentColor' : 'none'"
                stroke-linejoin="round"
              />
            </svg>
          </button>

          <button
            type="button"
            class="modal__toggle"
            :class="{ 'modal__toggle--on': autoNext }"
            :aria-pressed="autoNext"
            @click="autoNext = !autoNext"
          >
            Auto-next
          </button>

          <button
            type="button"
            class="modal__control"
            :aria-pressed="isFullscreen"
            :aria-label="isFullscreen ? 'Exit fullscreen' : 'Fullscreen'"
            @click="toggleFullscreen"
          >
            <span aria-hidden="true">{{ isFullscreen ? '⤡' : '⤢' }}</span>
          </button>
        </div>
      </div>

      <div class="modal__meta">
        <h2 class="modal__name">
          {{ item.name }}
        </h2>

        <p class="modal__source">
          <span v-if="item.srcAuthor">{{ item.srcAuthor }}</span>
          <span
            v-if="item.srcLocation"
            class="modal__dim"
          >{{ item.srcLocation }}</span>
          <span
            v-if="item.srcType"
            class="modal__dim"
          >{{ item.srcType }}</span>
        </p>

        <Cluster
          space="2xs"
          class="modal__tags"
        >
          <span
            v-if="item.bin"
            class="modal__tag modal__tag--bin"
          >{{ item.bin }}</span>
          <span
            v-for="topic in item.topics"
            :key="topic"
            class="modal__tag"
          >{{ topic }}</span>
          <span
            v-for="keyword in item.keywords"
            :key="keyword"
            class="modal__tag modal__tag--dim"
          >
            {{ keyword }}
          </span>
        </Cluster>

        <p
          v-if="item.description"
          class="modal__description"
        >
          {{ item.description }}
        </p>

        <p
          v-if="item.srcURL"
          class="modal__link"
        >
          <a
            :href="item.srcURL"
            target="_blank"
            rel="noreferrer"
            @click="track('source-out')"
          >Original source ↗</a>
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: grid;
  place-items: center;
  padding: var(--space-m);
}

/* Entirely `.scrim` in primitives.css — positioning, opacity, blur and the
   no-backdrop-filter fallback. Every modal backdrop on the site is the same
   surface, so this one overrides none of it. */

/*
 * Video on the left, metadata on the right — and the whole point of the layout
 * is that NEITHER moves when the clip changes.
 *
 * The width is capped by the viewport HEIGHT as well as its width, so that a
 * strictly 16:9 stage always fits inside `92svh` without the stage having to
 * give up its ratio to a max-height. Solving it here means the ratio below can
 * be unconditional, which is what actually stops the jump.
 */
.modal__panel {
  /* Level 4, the top of the scale, and the largest gap in it: a dialog reads
     as being in front of the whole page rather than one step above it. Glass
     and border come from `.frosted` in primitives.css. */
  --elevation: var(--shadow-4);
  --frost-base: var(--surface-raised);

  --modal-meta: 19rem;
  --modal-chrome: 3rem; /* the controls strip under the video */

  position: relative;
  inline-size: min(
    96rem,
    100%,
    calc((92svh - var(--modal-chrome)) * 16 / 9 + var(--modal-meta))
  );

  /* The panel never scrolls; the metadata column does. A scrolling panel would
     move the video when a long description arrived. */
  overflow: hidden;
}

/*
 * The metadata is taken OUT OF FLOW rather than made a grid column, and that is
 * the difference between the video not resizing and the video not MOVING.
 *
 * As a grid or flex item it still contributes to the row height, so a clip with
 * a 500-character description made the panel 40px taller than one without —
 * the stage kept its size but shifted vertically, because the panel is centred
 * in the viewport. Absolutely positioned, the column fills whatever height the
 * video column establishes and scrolls inside it, so nothing the metadata does
 * can reach the player.
 */
.modal__main {
  inline-size: calc(100% - var(--modal-meta));
  min-inline-size: 0;
}

/*
 * Unconditional 16:9.
 *
 * Without it the stage took its height from the video's intrinsic size, so it
 * resized twice over: once when the poster gave way to the decoded video, and
 * again on every clip with a different shape. `contain` letterboxes whatever
 * does not match, which is the correct trade — the framing of the work is part
 * of the work, and a stable frame is worth more than a filled one.
 */
.modal__stage {
  position: relative;
  aspect-ratio: 16 / 9;
  background: var(--surface-sunken);
}

.modal__video {
  display: block;
  inline-size: 100%;
  block-size: 100%;
  object-fit: contain;
  cursor: pointer;
}

/* Fills the same 16:9 stage, so a clip with no media does not resize it either. */
.modal__unavailable {
  display: grid;
  place-items: center;
  block-size: 100%;
  padding: var(--space-m);
  text-align: center;
  color: var(--ink-faint);
  font-size: var(--text-xs);
}

.modal__close {
  position: absolute;
  inset-block-start: var(--space-xs);
  inset-inline-end: var(--space-xs);
  padding: var(--space-2xs);
  color: var(--ink);
  background: color-mix(in srgb, var(--surface-sunken) 70%, transparent);
}

.modal__step {
  position: absolute;
  inset-block-start: 50%;
  transform: translateY(-50%);
  padding: var(--space-xs) var(--space-s);
  font-size: var(--text-lg);
  line-height: 1;
  color: var(--ink);
  background: color-mix(in srgb, var(--surface-sunken) 60%, transparent);
}

.modal__step--prev { inset-inline-start: 0; }
.modal__step--next { inset-inline-end: 0; }

.modal__controls {
  display: flex;
  gap: var(--space-xs);
  align-items: center;
  flex-wrap: wrap;
  padding: var(--space-xs) var(--space-s);
  border-block-end: 1px solid var(--rule);
}

.modal__control {
  padding: var(--space-2xs);
  font-size: var(--text-xs);
  color: var(--ink-muted);
  line-height: 1;
}

.modal__control:hover { color: var(--ink); }
.modal__control--on { color: var(--accent); }

.modal__seek {
  flex: 1;
  min-inline-size: 6rem;
  accent-color: var(--accent);
  cursor: pointer;
}

.modal__time {
  font-family: var(--font-mono);
  font-size: var(--text-2xs);
  color: var(--ink-faint);
  font-variant-numeric: tabular-nums;
}

.modal__toggle {
  border: 1px solid var(--rule);
  padding: var(--space-3xs) var(--space-xs);
  font-size: var(--text-2xs);
  letter-spacing: var(--tracking-wide);
  text-transform: uppercase;
  color: var(--ink-faint);
}

.modal__toggle--on {
  color: var(--accent);
  border-color: var(--accent);
}

/*
 * The metadata column, and the reason the type is a step smaller than it looks
 * like it should be.
 *
 * Clip titles here are raw filenames — some are three words, some run to a
 * hundred characters — and descriptions vary just as much. At the old sizes a
 * long one pushed the column taller than the video and grew the panel, so the
 * player moved every time you pressed Next. Smaller type plus a fixed-width
 * column that scrolls on its own means the panel's size is set by the video
 * alone and nothing the metadata does can shift it.
 */
.modal__meta {
  position: absolute;
  inset-block: 0;
  inset-inline-end: 0;
  inline-size: var(--modal-meta);

  padding: var(--space-m) var(--space-m) var(--space-l);
  border-inline-start: 1px solid var(--rule);
  overflow-y: auto;
  overscroll-behavior: contain;
}

.modal__name {
  font-size: var(--text-sm);
  line-height: var(--leading-snug);
  letter-spacing: 0;
  /* Filenames arrive as one unbroken token often enough that this is not
     optional in a 19rem column. */
  overflow-wrap: anywhere;
}

.modal__source {
  margin-block-start: var(--space-2xs);
  font-size: var(--text-xs);
  color: var(--ink-muted);
  overflow-wrap: anywhere;
}

.modal__dim {
  color: var(--ink-faint);
  margin-inline-start: var(--space-xs);
}

.modal__tags { margin-block-start: var(--space-s); }

.modal__tag {
  border: 1px solid var(--rule);
  padding: 0 var(--space-2xs);
  font-size: var(--text-2xs);
  color: var(--ink-muted);
}

.modal__tag--bin {
  border-color: var(--accent-dim);
  color: var(--accent);
}

.modal__tag--dim { color: var(--ink-faint); }

.modal__description {
  margin-block-start: var(--space-m);
  font-size: var(--text-xs);
  line-height: var(--leading-normal);
  color: var(--ink-muted);
}

.modal__link {
  margin-block-start: var(--space-s);
  font-size: var(--text-xs);
  overflow-wrap: anywhere;
}

/*
 * Below the two-column threshold the metadata goes back under the video. A
 * 19rem column beside a video on a phone leaves neither of them usable.
 */
@media (width < 52rem) {
  .modal__panel {
    inline-size: min(72rem, 100%);
    max-block-size: 92svh;
    overflow-y: auto;
  }

  .modal__main {
    inline-size: 100%;
  }

  /* Back into the flow, under the video. */
  .modal__meta {
    position: static;
    inline-size: auto;
    border-inline-start: 0;
    border-block-start: 1px solid var(--rule);
    overflow-y: visible;
  }
}
</style>
