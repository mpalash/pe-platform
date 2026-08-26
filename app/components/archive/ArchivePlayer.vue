<script setup lang="ts">
import type { ArchiveItem } from '~~/shared/utils/archive'

/**
 * One clip. Ported from pe-vue's VideoPlayer.
 *
 * The behaviour worth preserving: a clip plays when it is comfortably in view
 * and pauses when it is not, and only ever one plays at a time. That is what
 * makes the feed feel like an archive rather than a page of videos.
 *
 * Kept from the original: IntersectionObserver, the centre-of-viewport test, the
 * play delay, the single-active-player coordination, muted-by-default.
 * Dropped: the analytics calls (no analytics in the dependency budget), the
 * PocketBase bookmark write (no accounts until Phase 5), the debug logging.
 *
 * `src` comes from usePlaybackSource — this component never names a container
 * format (hard rule 5).
 */
const props = withDefaults(defineProps<{
  item: ArchiveItem
  /** Delay before an in-view clip claims playback, in ms. */
  playDelay?: number
}>(), {
  playDelay: 120,
})

const archive = useArchive()
const active = useActivePlayer()

const { src, poster } = usePlaybackSource(props.item.filename)

const videoEl = useTemplateRef<HTMLVideoElement>('videoEl')

const isPlaying = ref(false)
const progress = ref(0)
const remaining = ref(0)
const duration = ref(0)

let observer: IntersectionObserver | null = null
let playTimer: ReturnType<typeof setTimeout> | undefined
let playPromise: Promise<void> | null = null

const isBookmarked = computed(() => archive.isBookmarked(props.item.id))

/**
 * "Comfortably in view" — not merely intersecting. A clip half off the bottom
 * of the screen should not start; the original used the same band and it is
 * what stops the feed stuttering as you scroll.
 */
function isWellPlaced(): boolean {
  const el = videoEl.value
  if (!el) return false

  const rect = el.getBoundingClientRect()
  return rect.top > window.innerHeight * 0.05 && rect.bottom < window.innerHeight * 0.95
}

function claimPlayback(): void {
  if (!isWellPlaced()) return
  if (active.currentId.value === props.item.id) return

  clearTimeout(playTimer)
  playTimer = setTimeout(() => {
    if (isWellPlaced()) active.claim(props.item.id)
  }, props.playDelay)
}

async function play(): Promise<void> {
  const el = videoEl.value
  if (!el || !src) return
  if (!el.paused && !el.ended) return

  el.muted = active.muted.value

  try {
    playPromise = el.play()
    await playPromise
    isPlaying.value = true
  }
  catch {
    // Autoplay rejection is normal and not an error worth surfacing — a muted
    // clip that the browser declines to start simply stays paused.
    isPlaying.value = false
  }
  finally {
    playPromise = null
  }
}

function pause(): void {
  const el = videoEl.value
  if (!el || el.paused) return

  // Pausing mid-play() throws in Chrome; wait the promise out first.
  const stop = () => {
    el.pause()
    isPlaying.value = false
  }

  if (playPromise) {
    playPromise.then(stop).catch(() => {
      isPlaying.value = false
    })
  }
  else {
    stop()
  }
}

function togglePlay(): void {
  if (isPlaying.value) {
    pause()
    if (active.currentId.value === props.item.id) active.release()
  }
  else {
    active.claim(props.item.id)
  }
}

function onTimeUpdate(): void {
  const el = videoEl.value
  if (!el || !Number.isFinite(el.duration)) return

  duration.value = el.duration
  progress.value = (el.currentTime / el.duration) * 100
  remaining.value = el.duration - el.currentTime
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return '0:00'
  const minutes = Math.floor(seconds / 60)
  const rest = Math.floor(seconds % 60)
  return `${minutes}:${String(rest).padStart(2, '0')}`
}

/** Scrubbing, which the original did not offer. Keyboard-operable for free. */
function seek(event: Event): void {
  const el = videoEl.value
  const input = event.target as HTMLInputElement
  if (!el || !Number.isFinite(el.duration)) return
  el.currentTime = (Number(input.value) / 100) * el.duration
}

watch(active.currentId, (id) => {
  if (id === props.item.id) void play()
  else pause()
})

watch(active.muted, (muted) => {
  if (videoEl.value) videoEl.value.muted = muted
})

onMounted(() => {
  if (!videoEl.value) return

  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) claimPlayback()
        else if (active.currentId.value === props.item.id) active.release()
      }
    },
    { threshold: [0, 0.5, 0.9], rootMargin: '0px' },
  )

  observer.observe(videoEl.value)
})

onBeforeUnmount(() => {
  observer?.disconnect()
  clearTimeout(playTimer)
  pause()
  if (active.currentId.value === props.item.id) active.release()
})
</script>

<template>
  <article class="clip">
    <Frame
      ratio="16 / 9"
      fit="contain"
      class="clip__frame"
    >
      <video
        v-if="src"
        ref="videoEl"
        :src="src"
        :poster="poster ?? undefined"
        loop
        playsinline
        preload="none"
        :muted="active.muted.value"
        @timeupdate="onTimeUpdate"
        @play="isPlaying = true"
        @pause="isPlaying = false"
        @click.stop="togglePlay"
      />
      <p
        v-else
        class="clip__unavailable"
      >
        Media is not configured — set <code>NUXT_PUBLIC_MEDIA_BASE</code>.
      </p>
    </Frame>

    <div
      v-if="src"
      class="clip__controls"
    >
      <button
        type="button"
        class="clip__control"
        :aria-label="isPlaying ? `Pause ${item.name}` : `Play ${item.name}`"
        @click="togglePlay"
      >
        <span aria-hidden="true">{{ isPlaying ? '❚❚' : '▶' }}</span>
      </button>

      <label
        class="visually-hidden"
        :for="`seek-${item.id}`"
      >Seek within {{ item.name }}</label>
      <input
        :id="`seek-${item.id}`"
        class="clip__seek"
        type="range"
        min="0"
        max="100"
        step="0.1"
        :value="progress"
        @input="seek"
      >

      <span class="clip__time">−{{ formatTime(remaining) }}</span>

      <button
        type="button"
        class="clip__control"
        :aria-pressed="active.muted.value"
        :aria-label="active.muted.value ? 'Unmute' : 'Mute'"
        @click="active.toggleMuted()"
      >
        <span aria-hidden="true">{{ active.muted.value ? '🔇' : '🔊' }}</span>
      </button>

      <button
        type="button"
        class="clip__control"
        :class="{ 'clip__control--on': isBookmarked }"
        :aria-pressed="isBookmarked"
        :aria-label="isBookmarked ? `Remove ${item.name} from saved` : `Save ${item.name}`"
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
    </div>

    <div class="clip__meta">
      <h2
        class="clip__name"
        :title="item.name"
      >
        {{ item.name }}
      </h2>

      <p class="clip__source">
        <span v-if="item.srcAuthor">{{ item.srcAuthor }}</span>
        <span
          v-if="item.srcLocation"
          class="clip__dim"
        >({{ item.srcLocation }})</span>
        <span
          v-if="item.srcType"
          class="clip__dim"
        >{{ item.srcType }}</span>
        <span
          v-if="duration"
          class="clip__dim"
        >{{ formatTime(duration) }}</span>
      </p>

      <Cluster
        space="2xs"
        class="clip__tags"
      >
        <span
          v-if="item.bin"
          class="clip__tag clip__tag--bin"
        >{{ item.bin }}</span>
        <span
          v-for="topic in item.topics"
          :key="topic"
          class="clip__tag"
        >{{ topic }}</span>
        <span
          v-for="keyword in item.keywords"
          :key="keyword"
          class="clip__tag clip__tag--dim"
        >
          {{ keyword }}
        </span>
      </Cluster>
    </div>
  </article>
</template>

<style scoped>
.clip {
  border: 1px solid var(--rule);
  background: var(--surface-raised);
}

.clip__frame {
  background: var(--surface-sunken);
  cursor: pointer;
}

.clip__unavailable {
  display: grid;
  place-items: center;
  block-size: 100%;
  padding: var(--space-m);
  font-size: var(--text-xs);
  color: var(--ink-faint);
  text-align: center;
}

.clip__controls {
  display: flex;
  gap: var(--space-xs);
  align-items: center;
  padding: var(--space-2xs) var(--space-s);
  border-block-end: 1px solid var(--rule);
}

.clip__control {
  padding: var(--space-2xs);
  font-size: var(--text-xs);
  color: var(--ink-muted);
  line-height: 1;
}

.clip__control:hover {
  color: var(--ink);
}

.clip__control--on {
  color: var(--accent);
}

.clip__seek {
  flex: 1;
  min-inline-size: 0;
  accent-color: var(--accent);
  cursor: pointer;
}

.clip__time {
  font-family: var(--font-mono);
  font-size: var(--text-2xs);
  color: var(--ink-faint);
  font-variant-numeric: tabular-nums;
}

.clip__meta {
  padding: var(--space-s);
}

.clip__name {
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
  line-height: var(--leading-snug);
  letter-spacing: 0;
  /* Archive filenames are extremely long; two lines then ellipsis. */
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.clip__source {
  margin-block-start: var(--space-2xs);
  font-size: var(--text-xs);
  color: var(--ink-muted);
}

.clip__dim {
  color: var(--ink-faint);
  margin-inline-start: var(--space-2xs);
}

.clip__tags {
  margin-block-start: var(--space-xs);
}

.clip__tag {
  border: 1px solid var(--rule);
  padding: 0 var(--space-2xs);
  font-size: var(--text-2xs);
  color: var(--ink-muted);
}

.clip__tag--bin {
  border-color: var(--accent-dim);
  color: var(--accent);
}

.clip__tag--dim {
  color: var(--ink-faint);
}
</style>
