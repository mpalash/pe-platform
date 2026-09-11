<script setup lang="ts">
import { SESSION_METRICS, type SessionMetrics } from '~~/shared/utils/sessions'

/**
 * The headset's six readings across a session, as line graphs under the video
 * — from the session's met.csv, via useSessionMetrics. A playhead marks where
 * the video is.
 *
 * Hand-drawn SVG, not a charting library: six polylines on a fixed 0–1 scale
 * is a few lines of arithmetic, and the dependency budget has no chart in it.
 *
 * The time axis is the whole recording, so the graph reads left to right
 * exactly as the seek bar does. The paths are computed once per session; only
 * the playhead moves on `timeupdate`.
 *
 * Not interactive — seeking is the seek bar's job, and it is already keyboard
 * operable. `aria-hidden` on the plot, with the legend as text, because six
 * lines of a few hundred points each have no useful spoken form.
 */
const props = defineProps<{
  /** Null until the first play fetches them. */
  metrics: SessionMetrics | null
  /** The playhead, in seconds. */
  time: number
}>()

/** viewBox units. Stretched to the box with `preserveAspectRatio="none"`. */
const WIDTH = 1000
const HEIGHT = 100
/** Keeps a reading of 1 or 0 from being clipped by the edge. */
const INSET = 4

/**
 * Readings arrive every ten seconds or so. A longer silence is the headset
 * dropping out, and the line breaks there rather than drawing a straight
 * line across a stretch nobody measured.
 */
const MAX_STEP = 45 // every session samples at 10s

const paths = computed(() => {
  const data = props.metrics
  if (!data || data.duration <= 0) return []

  const x = (at: number) => (at / data.duration) * WIDTH
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

const playhead = computed(() => {
  const duration = props.metrics?.duration ?? 0
  return duration > 0 ? `${Math.min(100, Math.max(0, (props.time / duration) * 100))}%` : null
})

const empty = computed(() => props.metrics !== null && props.metrics.readings.length === 0)
</script>

<template>
  <figure class="graph">
    <figcaption class="graph__legend">
      <span class="graph__title">Headset</span>
      <abbr
        v-for="(metric, index) in SESSION_METRICS"
        :key="metric.key"
        class="graph__key"
        :title="metric.label"
        :style="{ color: `var(--series-${index + 1})` }"
      >{{ metric.short }}</abbr>
      <span
        v-if="empty"
        class="graph__empty"
      >No readings for this session</span>
    </figcaption>

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
      <span
        v-if="playhead"
        class="graph__playhead"
        :style="{ insetInlineStart: playhead }"
      />
    </div>
  </figure>
</template>

<style scoped>
/*
 * A FIXED height, legend included: ArchiveModalPlayer adds exactly this to
 * the chrome it reserves under the video (`--modal-chrome`), so the panel
 * still fits the viewport. Change one, change the other.
 */
.graph {
  --graph-block: 7rem;

  display: grid;
  grid-template-rows: auto 1fr;
  gap: var(--space-3xs);
  block-size: var(--graph-block);
  margin: 0;
  padding: var(--space-2xs) var(--space-s);
  border-block-end: 1px solid var(--rule);
  background: var(--surface-sunken);
}

.graph__legend {
  display: flex;
  gap: var(--space-xs);
  align-items: baseline;
  font-family: var(--font-mono);
  font-size: var(--text-2xs);
  line-height: 1;
}

.graph__title {
  color: var(--ink-faint);
  letter-spacing: var(--tracking-wide);
  text-transform: uppercase;
  font-family: var(--font-body);
}

.graph__key {
  text-decoration: none;
  cursor: help;
}

.graph__empty {
  margin-inline-start: auto;
  color: var(--ink-faint);
  font-family: var(--font-body);
}

.graph__plot {
  position: relative;
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

.graph__playhead {
  position: absolute;
  inset-block: 0;
  inline-size: 1px;
  background: var(--ink);
  pointer-events: none;
}
</style>
