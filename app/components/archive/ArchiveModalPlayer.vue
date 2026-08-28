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

  // Lock the page behind. Without this the background scrolls under the modal,
  // which on a feed of autoplaying video is genuinely disorienting.
  document.body.style.overflow = 'hidden'
  document.addEventListener('fullscreenchange', onFullscreenChange)

  nextTick(() => dialog.value?.focus())
})

onBeforeUnmount(() => {
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
    @keydown="onKeydown"
  >
    <div
      class="modal__scrim scrim"
      @click="emit('close')"
    />

    <div class="modal__panel">
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

/* Positioning, opacity and fallback come from `.scrim` in primitives.css.
   Blurred harder than the others, and only blurred: this modal is itself a
   video, so the archive behind it needs to stop resolving into anything the eye
   can follow. Opacity is shared across every scrim. */
.modal__scrim {
  --scrim-blur: 20px;
}

.modal__panel {
  position: relative;
  inline-size: min(72rem, 100%);
  max-block-size: 92svh;
  overflow-y: auto;
  background: var(--surface-raised);
  border: 1px solid var(--rule);
}

.modal__stage {
  position: relative;
  background: var(--surface-sunken);
}

.modal__video {
  inline-size: 100%;
  max-block-size: 68svh;
  object-fit: contain;
  cursor: pointer;
}

.modal__unavailable {
  display: grid;
  place-items: center;
  min-block-size: 20rem;
  color: var(--ink-faint);
  font-size: var(--text-sm);
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

.modal__meta {
  padding: var(--space-m) var(--space-l) var(--space-l);
}

.modal__name {
  font-size: var(--text-md);
  line-height: var(--leading-snug);
  letter-spacing: 0;
}

.modal__source {
  margin-block-start: var(--space-2xs);
  font-size: var(--text-sm);
  color: var(--ink-muted);
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
  max-inline-size: var(--measure);
  font-size: var(--text-sm);
  color: var(--ink-muted);
}

.modal__link {
  margin-block-start: var(--space-s);
  font-size: var(--text-sm);
}
</style>
