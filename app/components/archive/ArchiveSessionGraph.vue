<script setup lang="ts">
import { SESSION_METRICS, type SessionMetrics } from '~~/shared/utils/sessions'

/**
 * A session's timeline: the headset's six readings as line graphs, with the
 * progress bar under them on the same time axis — from the session's met.csv,
 * via useSessionMetrics. For a session this REPLACES the seek bar in the
 * player's controls; the control bar keeps everything else.
 *
 * One control rather than a graph plus a range input, because the two could
 * never line up: a native range maps its ends to the thumb's centre, inset by
 * half a thumb whose width every browser picks for itself, so the bar's 0:00
 * would sit a few pixels right of the graph's. Here the graph, the playhead
 * and the bar share one box and one scale.
 *
 * It is a `role="slider"` and fully keyboard operable (hard rule 11): arrows
 * step 5 seconds, Page Up/Down 30, Home/End go to the ends. Arrow keys are
 * kept from bubbling, or the modal would also take them as previous/next clip.
 * Pointer: press anywhere on the graph or the bar and drag.
 *
 * Hand-drawn SVG, not a charting library: six polylines on a fixed 0–1 scale
 * is a few lines of arithmetic, and the dependency budget has no chart in it.
 * The paths are computed once per session; only the playhead moves on
 * `timeupdate`. The plot is `aria-hidden` — six lines of a few hundred points
 * have no useful spoken form — and the legend is text.
 */
const props = defineProps<{
  /** Null until they are fetched. */
  metrics: SessionMetrics | null
  /** The playhead, in seconds. */
  time: number
  /** The video's duration once known; until then the readings' own. */
  duration: number
}>()

const emit = defineEmits<{ seek: [seconds: number] }>()

/** viewBox units. Stretched to the box with `preserveAspectRatio="none"`. */
const WIDTH = 1000
const HEIGHT = 100
/** Keeps a reading of 1 or 0 from being clipped by the edge. */
const INSET = 4

/**
 * Readings arrive every ten seconds in every session. A longer silence is the
 * headset dropping out, and the line breaks there rather than drawing a
 * straight line across a stretch nobody measured.
 */
const MAX_STEP = 45

/** Keyboard steps, in seconds. */
const STEP = 5
const PAGE = 30

const span = computed(() => props.duration > 0 ? props.duration : (props.metrics?.duration ?? 0))

const paths = computed(() => {
  const data = props.metrics
  const total = span.value
  if (!data || total <= 0) return []

  const x = (at: number) => (at / total) * WIDTH
  const y = (value: number) => INSET + (1 - value) * (HEIGHT - INSET * 2)

  return SESSION_METRICS.map((metric, index) => {
    let d = ''
    let last: number | null = null
    for (const { at, values } of data.readings) {
      const value = values[index]
      if (value === null || value === undefined) {
        last = null
        continue
      }
      const joined = last !== null && at - last <= MAX_STEP
      // `h0` after a move: a zero-length segment, which the round cap draws as
      // a dot. Otherwise a lone reading between two dropouts draws nothing.
      d += joined ? `L${x(at).toFixed(1)} ${y(value).toFixed(1)}` : `M${x(at).toFixed(1)} ${y(value).toFixed(1)}h0`
      last = at
    }
    return { key: metric.key, d, colour: `var(--series-${index + 1})` }
  })
})

const fraction = computed(() => span.value > 0 ? Math.min(1, Math.max(0, props.time / span.value)) : 0)
const position = computed(() => `${fraction.value * 100}%`)

const empty = computed(() => props.metrics !== null && props.metrics.readings.length === 0)

function clock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds))
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
}

const valueText = computed(() => `${clock(props.time)} of ${clock(span.value)}`)

/* ── seeking ─────────────────────────────────────────────────────────────── */

function seekTo(seconds: number): void {
  if (span.value <= 0) return
  emit('seek', Math.min(span.value, Math.max(0, seconds)))
}

const timeline = useTemplateRef<HTMLElement>('timeline')
let dragging = false

function seekToPointer(event: PointerEvent): void {
  const box = timeline.value?.getBoundingClientRect()
  if (!box || box.width <= 0) return
  seekTo(((event.clientX - box.left) / box.width) * span.value)
}

function onPointerDown(event: PointerEvent): void {
  if (event.button !== 0 || span.value <= 0) return
  dragging = true
  // Seek first: capture only makes the drag follow outside the box, and it
  // throws for a pointer the browser no longer considers active.
  seekToPointer(event)
  try {
    timeline.value?.setPointerCapture(event.pointerId)
  }
  catch {
    // The press still seeked; only the drag is lost.
  }
}

function onPointerMove(event: PointerEvent): void {
  if (dragging) seekToPointer(event)
}

function onPointerUp(event: PointerEvent): void {
  dragging = false
  if (timeline.value?.hasPointerCapture(event.pointerId)) {
    timeline.value.releasePointerCapture(event.pointerId)
  }
}

const KEYS: Record<string, (t: number) => number> = {
  ArrowLeft: t => t - STEP,
  ArrowDown: t => t - STEP,
  ArrowRight: t => t + STEP,
  ArrowUp: t => t + STEP,
  PageDown: t => t - PAGE,
  PageUp: t => t + PAGE,
  Home: () => 0,
  End: () => Number.POSITIVE_INFINITY,
}

function onKeydown(event: KeyboardEvent): void {
  const move = KEYS[event.key]
  if (!move) return
  event.preventDefault()
  event.stopPropagation()
  seekTo(move(props.time))
}
</script>

<template>
  <figure class="graph">
    <figcaption class="graph__legend">
      <span class="visually-hidden">Headset readings:</span>
      <abbr
        v-for="(metric, index) in SESSION_METRICS"
        :key="metric.key"
        class="graph__key"
        :title="metric.label"
        :style="{ color: `var(--series-${index + 1})` }"
      >{{ metric.short }}</abbr>
    </figcaption>

    <div
      ref="timeline"
      class="graph__timeline"
      role="slider"
      tabindex="0"
      aria-label="Seek"
      aria-valuemin="0"
      :aria-valuemax="Math.round(span)"
      :aria-valuenow="Math.round(time)"
      :aria-valuetext="valueText"
      :aria-disabled="span <= 0"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
      @keydown="onKeydown"
    >
      <div class="graph__plot">
        <svg
          :viewBox="`0 0 ${WIDTH} ${HEIGHT}`"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <line
            v-for="level in [0, 0.5, 1]"
            :key="level"
            class="graph__rule"
            x1="0"
            :x2="WIDTH"
            :y1="INSET + (1 - level) * (HEIGHT - INSET * 2)"
            :y2="INSET + (1 - level) * (HEIGHT - INSET * 2)"
          />
          <path
            v-for="line in paths"
            :key="line.key"
            class="graph__line"
            :d="line.d"
            :stroke="line.colour"
          />
        </svg>
        <p
          v-if="empty"
          class="graph__empty"
        >
          No headset readings for this session
        </p>
      </div>

      <!-- The progress bar: filled to the playhead, on the graph's axis. -->
      <div
        class="graph__track"
        aria-hidden="true"
      >
        <span
          class="graph__fill"
          :style="{ inlineSize: position }"
        />
      </div>

      <span
        class="graph__playhead"
        aria-hidden="true"
        :style="{ insetInlineStart: position }"
      />
    </div>
  </figure>
</template>

<style scoped>
/*
 * A FIXED height: ArchiveModalPlayer adds exactly this to the chrome it
 * reserves under the video (`--modal-chrome`), so the panel still fits the
 * viewport. Change one, change the other.
 */
.graph {
  --graph-block: 10rem;
  --track: 4px;

  display: grid;
  grid-template-columns: auto 1fr;
  gap: var(--space-xs);
  block-size: var(--graph-block);
  margin: 0;
  padding: var(--space-xs) var(--space-s);
  border-block-end: 1px solid var(--rule);
  background: var(--surface-sunken);
}

/* The labels in a column at the start of the lines, spread over the plot's
   height — not the track's, which sits below the last of them. */
.graph__legend {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding-block-end: calc(var(--track) + var(--space-2xs));
  font-family: var(--font-mono);
  font-size: var(--text-2xs);
  line-height: 1;
}

.graph__key {
  text-decoration: none;
  cursor: help;
}

.graph__timeline {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: var(--space-2xs);
  min-inline-size: 0;
  cursor: pointer;
  touch-action: none; /* or a drag scrolls the page instead of seeking */
}

.graph__timeline[aria-disabled='true'] {
  cursor: default;
}

.graph__timeline:focus-visible {
  outline: var(--focus-width) solid var(--focus);
  outline-offset: var(--focus-offset);
}

.graph__plot {
  position: relative;
  flex: 1;
  min-block-size: 0;
}

.graph__plot svg {
  display: block;
  inline-size: 100%;
  block-size: 100%;
  overflow: visible;
}

.graph__rule {
  stroke: var(--rule);
  stroke-width: 1;
  vector-effect: non-scaling-stroke;
}

.graph__line {
  fill: none;
  stroke-width: 1.25;
  stroke-linejoin: round;
  stroke-linecap: round;
  /* The viewBox is stretched to the box; without this, lines would thicken
     and thin with the player's aspect ratio. */
  vector-effect: non-scaling-stroke;
}

.graph__empty {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  margin: 0;
  font-size: var(--text-2xs);
  color: var(--ink-faint);
}

.graph__track {
  flex: none;
  block-size: var(--track);
  background: var(--rule-strong);
}

.graph__fill {
  display: block;
  block-size: 100%;
  background: var(--accent);
}

/* Through the plot and the bar alike: one line says where the video is. */
.graph__playhead {
  position: absolute;
  inset-block: 0;
  inline-size: 1px;
  background: var(--ink);
  pointer-events: none;
}

/* The bar's handle, where the playhead crosses it. */
.graph__playhead::after {
  content: '';
  position: absolute;
  inset-block-end: calc(var(--track) / 2 - 5px);
  inset-inline-start: -5px;
  inline-size: 11px;
  block-size: 11px;
  border-radius: 50%;
  background: var(--accent);
}
</style>
