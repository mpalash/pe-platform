<script setup lang="ts">
/**
 * The reference page (Phase 2 §2.6).
 *
 * Every token and every primitive, on one route. This is what Phases 3 and 4
 * build against, and the fastest way to see whether a token change holds up —
 * far cheaper to maintain than a Storybook at this scale.
 *
 * The contrast table computes itself from the live cascade. Numbers written by
 * hand go stale; these cannot.
 */

useHead({ title: 'Reference' })

const surfaces = ['--surface', '--surface-raised', '--surface-sunken'] as const
const inks = ['--ink', '--ink-muted', '--ink-faint', '--accent'] as const

interface Measured {
  ink: string
  surface: string
  ratio: number
  grade: string
}

const measured = ref<Measured[]>([])

onMounted(() => {
  measured.value = inks.flatMap(ink =>
    surfaces.map((surface) => {
      const ratio = contrastRatio(readToken(ink), readToken(surface)) ?? 0
      return { ink, surface, ratio, grade: gradeContrast(ratio) }
    }),
  )
})

const typeScale = [
  ['--text-3xl', '3xl'],
  ['--text-2xl', '2xl'],
  ['--text-xl', 'xl'],
  ['--text-lg', 'lg'],
  ['--text-md', 'md'],
  ['--text-base', 'base'],
  ['--text-sm', 'sm'],
  ['--text-xs', 'xs'],
  ['--text-2xs', '2xs'],
] as const

const spaceScale = ['3xs', '2xs', 'xs', 's', 'm', 'l', 'xl', '2xl', '3xl', '4xl'] as const
const durations = ['instant', 'quick', 'normal', 'slow'] as const

const boxOpen = ref(false)
</script>

<template>
  <Stack
    space="section"
    as="article"
  >
    <!-- ── Header ─────────────────────────────────────────────────────── -->
    <Center
      measure="wide"
      as="header"
    >
      <Stack space="s">
        <h1>Design system reference</h1>
        <p class="lede">
          Every token and primitive in the system, rendered. Dark only, system type,
          austere editorial. Nothing here is a component — components arrive when a
          real screen needs one.
        </p>
      </Stack>
    </Center>

    <!-- ── Colour ─────────────────────────────────────────────────────── -->
    <Center
      measure="wide"
      as="section"
    >
      <Stack space="l">
        <h2>Colour</h2>
        <p>
          Semantic tokens only. The ratios below are measured in your browser from the
          resolved custom properties, so they cannot drift from the values they describe.
          Body text needs <strong>4.5:1</strong>; large text needs 3:1.
        </p>

        <Grid
          min="9rem"
          space="s"
        >
          <div
            v-for="token in [...surfaces, ...inks, '--rule', '--rule-strong']"
            :key="token"
            class="swatch"
          >
            <div
              class="swatch__chip"
              :style="{ background: `var(${token})` }"
            />
            <code>{{ token }}</code>
          </div>
        </Grid>

        <div class="table-scroll">
          <table>
            <caption>
              Measured contrast, every ink against every surface.
            </caption>
            <thead>
              <tr>
                <th scope="col">
                  Foreground
                </th>
                <th scope="col">
                  Background
                </th>
                <th scope="col">
                  Ratio
                </th>
                <th scope="col">
                  Grade
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in measured"
                :key="`${row.ink}-${row.surface}`"
              >
                <td><code>{{ row.ink }}</code></td>
                <td><code>{{ row.surface }}</code></td>
                <td>{{ row.ratio.toFixed(2) }}:1</td>
                <td>
                  <span :data-grade="row.grade">{{ row.grade }}</span>
                </td>
              </tr>
              <tr v-if="measured.length === 0">
                <td colspan="4">
                  Measuring…
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <p>
          <code>--rule</code> is a decorative hairline, not text and not a meaningful
          boundary, so it is exempt from the 3:1 non-text minimum. Anything load-bearing
          uses <code>--ink-faint</code> or stronger.
        </p>
      </Stack>
    </Center>

    <!-- ── Type ───────────────────────────────────────────────────────── -->
    <Center
      measure="wide"
      as="section"
    >
      <Stack space="l">
        <h2>Type</h2>
        <p>
          Fluid scale — every size interpolates between a 20rem and a 90rem viewport,
          which is why there are no type breakpoints anywhere else in the system.
          Resize the window and watch these move.
        </p>

        <Stack space="s">
          <div
            v-for="[token, label] in typeScale"
            :key="token"
            class="specimen"
          >
            <span class="specimen__label"><code>{{ label }}</code></span>
            <span :style="{ fontSize: `var(${token})` }">Grotesque and unadorned</span>
          </div>
        </Stack>

        <h3>Measure</h3>
        <p>
          The single most consequential number for readability. Default is
          <code>--measure</code>, about 66 characters — the paragraph you are reading now.
        </p>
      </Stack>
    </Center>

    <!-- ── Space ──────────────────────────────────────────────────────── -->
    <Center
      measure="wide"
      as="section"
    >
      <Stack space="l">
        <h2>Space</h2>
        <p>One scale, used everywhere. A second scale appearing later is how coherence gets lost.</p>

        <Stack space="2xs">
          <div
            v-for="step in spaceScale"
            :key="step"
            class="space-row"
          >
            <span class="space-row__label"><code>{{ step }}</code></span>
            <span
              class="space-row__bar"
              :style="{ inlineSize: `var(--space-${step})` }"
            />
          </div>
        </Stack>
      </Stack>
    </Center>

    <!-- ── Motion ─────────────────────────────────────────────────────── -->
    <Center
      measure="wide"
      as="section"
    >
      <Stack space="l">
        <h2>Motion</h2>
        <p>
          Durations collapse to 1ms under <code>prefers-reduced-motion</code>, at the token
          level — so anything written against these tokens is compliant by construction.
          Turn the preference on in your OS and these swatches stop moving.
        </p>

        <Stack space="xs">
          <div
            v-for="d in durations"
            :key="d"
            class="motion-row"
          >
            <span class="motion-row__label"><code>{{ d }}</code></span>
            <span
              class="motion-row__dot"
              :style="{ transitionDuration: `var(--duration-${d})` }"
              :data-shifted="boxOpen"
            />
          </div>
        </Stack>

        <p>
          <button
            type="button"
            class="button"
            @click="boxOpen = !boxOpen"
          >
            {{ boxOpen ? 'Send back' : 'Move them' }}
          </button>
        </p>
      </Stack>
    </Center>

    <!-- ── Primitives ─────────────────────────────────────────────────── -->
    <Center
      measure="wide"
      as="section"
    >
      <Stack space="l">
        <h2>Layout primitives</h2>

        <h3>Stack</h3>
        <p>Vertical rhythm. Space between siblings, never at its own edges.</p>
        <Stack
          space="s"
          class="demo"
        >
          <div class="demo__box">
            One
          </div>
          <div class="demo__box">
            Two
          </div>
          <div class="demo__box">
            Three
          </div>
        </Stack>

        <h3>Cluster</h3>
        <p>Horizontal grouping that wraps. Narrow the window to see it fold.</p>
        <Cluster
          space="s"
          class="demo"
        >
          <span
            v-for="n in 9"
            :key="n"
            class="demo__tag"
          >tag {{ n }}</span>
        </Cluster>

        <h3>Grid</h3>
        <p>
          Responsive columns with no media queries — items claim a minimum width and the
          column count follows from the space available.
        </p>
        <Grid
          min="11rem"
          space="s"
          class="demo"
        >
          <div
            v-for="n in 6"
            :key="n"
            class="demo__box"
          >
            {{ n }}
          </div>
        </Grid>

        <h3>Frame</h3>
        <p>
          Aspect-ratio container. Reserves the space before media loads, which is what stops
          layout shift. <code>contain</code> letterboxes rather than crops — correct when the
          framing of the work is part of the work.
        </p>
        <Grid
          min="12rem"
          space="s"
        >
          <Frame
            ratio="16 / 9"
            class="demo__frame"
          >
            <div class="demo__fill">
              16 / 9
            </div>
          </Frame>
          <Frame
            ratio="1"
            class="demo__frame"
          >
            <div class="demo__fill">
              1 / 1
            </div>
          </Frame>
          <Frame
            ratio="3 / 4"
            class="demo__frame"
          >
            <div class="demo__fill">
              3 / 4
            </div>
          </Frame>
        </Grid>

        <h3>Center</h3>
        <p>Constrains to the measure. Three widths, all centred.</p>
        <Stack space="2xs">
          <Center
            measure="narrow"
            class="demo__measure"
          >
            narrow
          </Center>
          <Center
            measure="default"
            class="demo__measure"
          >
            default
          </Center>
          <Center
            measure="wide"
            class="demo__measure"
          >
            wide
          </Center>
        </Stack>
      </Stack>
    </Center>

    <!-- ── Focus and keyboard ─────────────────────────────────────────── -->
    <Center
      measure="wide"
      as="section"
    >
      <Stack space="l">
        <h2>Focus and keyboard</h2>
        <p>
          Tab through this row. Every control shows a visible ring, and the ring has
          contrast against all three surfaces. The skip link at the very top of the page is
          the first stop — press <kbd>Tab</kbd> from the address bar to reach it.
        </p>

        <Cluster
          space="s"
          class="demo"
        >
          <a href="#main">A link</a>
          <button
            type="button"
            class="button"
          >
            A button
          </button>
          <input
            type="text"
            aria-label="A text input"
            placeholder="An input"
          >
          <select aria-label="A select">
            <option>An option</option>
            <option>Another</option>
          </select>
        </Cluster>

        <p>
          Controls are real <code>&lt;button&gt;</code> and <code>&lt;a&gt;</code> elements,
          never a <code>&lt;div&gt;</code> with a click handler. The header's menu toggle is
          a <code>&lt;button aria-expanded&gt;</code> for the same reason.
        </p>
      </Stack>
    </Center>

    <!-- ── Prose ──────────────────────────────────────────────────────── -->
    <!-- Measure, not wide: .prose centres itself inside its parent, so a wider
         column here would offset the sample from the heading above it. -->
    <Center as="section">
      <Stack space="l">
        <h2>Long-form prose</h2>
        <p>
          Everything below sits inside <code>.prose</code> and receives no other styling.
          This is what Phase 4's rich-text blocks will emit.
        </p>

        <div class="prose">
          <h3>On keeping an archive</h3>

          <p>
            An archive is not a library. A library is organised for retrieval; an archive is
            organised for <em>survival</em>, and the difference shows up in every decision
            about how material is stored, described, and shown.
          </p>

          <p>
            What follows is a deliberately awkward sample: nested lists, a quotation, a
            figure with a caption, a table, and a full-bleed image inside constrained text.
            If the base styles are right, none of it needs additional CSS.
          </p>

          <h4>Three constraints</h4>

          <ol>
            <li>
              The material outlives the format.
              <ul>
                <li>Containers change; the work does not.</li>
                <li>
                  Which implies a seam:
                  <ul>
                    <li>one place that knows about formats,</li>
                    <li>and everywhere else that does not.</li>
                  </ul>
                </li>
              </ul>
            </li>
            <li>Description is interpretation, and interpretation dates.</li>
            <li>Access is the point. An archive nobody can reach is a storage cost.</li>
          </ol>

          <blockquote>
            <p>
              The past is never where you think you left it.
            </p>
            <cite>Katherine Anne Porter</cite>
          </blockquote>

          <figure>
            <Frame
              ratio="21 / 9"
              class="demo__frame"
            >
              <div class="demo__fill">
                A still, letterboxed
              </div>
            </Frame>
            <figcaption>
              A figure with a caption. Captions are constrained to a narrower measure than
              body text, because they are read differently.
            </figcaption>
          </figure>

          <p>
            Below, a full-bleed image inside otherwise-constrained prose — the arrangement
            that is expensive to retrofit and cheap to build in from the start.
          </p>

          <Bleed>
            <Frame
              ratio="21 / 9"
              class="demo__frame"
            >
              <div class="demo__fill">
                Full bleed, inside the measure
              </div>
            </Frame>
          </Bleed>

          <p>
            Tables scroll inside their own container rather than widening the page:
          </p>

          <div class="table-scroll">
            <table>
              <caption>Formats encountered, and what each cost</caption>
              <thead>
                <tr>
                  <th scope="col">
                    Format
                  </th>
                  <th scope="col">
                    Years
                  </th>
                  <th scope="col">
                    Failure mode
                  </th>
                  <th scope="col">
                    Recoverable
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>U-matic</td><td>1971–1986</td><td>Binder hydrolysis</td><td>Usually</td>
                </tr>
                <tr>
                  <td>Betacam SP</td><td>1986–2001</td><td>Dropout</td><td>Often</td>
                </tr>
                <tr>
                  <td>MiniDV</td><td>1995–2011</td><td>Head clog, block errors</td><td>Sometimes</td>
                </tr>
                <tr>
                  <td>Proprietary codec, no docs</td><td>2003–2009</td><td>Nobody remembers</td><td>Rarely</td>
                </tr>
              </tbody>
            </table>
          </div>

          <p>
            Inline <code>code</code> sits in prose without disrupting the line, and a block
            scrolls rather than pushing the page sideways:
          </p>

          <pre><code>ffprobe -v error -select_streams v:0 \
  -show_entries format=format_name,duration \
  -of default=noprint_wrappers=1 input.mp4</code></pre>

          <dl>
            <dt>Faststart</dt>
            <dd>The <code>moov</code> atom placed before <code>mdat</code>, so playback can begin before the file finishes downloading.</dd>
            <dt>Remux</dt>
            <dd>Rewriting a container without re-encoding its streams. Seconds, not hours.</dd>
          </dl>

          <hr>

          <p>
            <small>End of sample. Everything above: no block-specific CSS.</small>
          </p>
        </div>
      </Stack>
    </Center>
  </Stack>
</template>

<style scoped>
.lede {
  font-size: var(--text-md);
  color: var(--ink-muted);
  line-height: var(--leading-snug);
}

/* ── Colour ── */
.swatch__chip {
  block-size: 3.5rem;
  border: 1px solid var(--rule);
  margin-block-end: var(--space-2xs);
}

[data-grade='Fail'] {
  color: var(--ink);
  background: #7f1d1d;
  padding-inline: var(--space-2xs);
}

[data-grade='AA Large'] {
  color: var(--ink-muted);
}

/* ── Specimens ── */
.specimen {
  /* Display sizes wrap at this measure; body leading would make them sprawl. */
  line-height: var(--leading-tight);
  display: flex;
  gap: var(--space-m);
  align-items: baseline;
  border-block-end: 1px solid var(--rule);
  padding-block-end: var(--space-2xs);
}

.specimen__label {
  flex: 0 0 4rem;
  color: var(--ink-faint);
}

/* ── Space ── */
.space-row {
  display: flex;
  gap: var(--space-m);
  align-items: center;
}

.space-row__label {
  flex: 0 0 4rem;
  color: var(--ink-faint);
}

.space-row__bar {
  display: block;
  block-size: 0.75rem;
  background: var(--accent-dim);
}

/* ── Motion ── */
.motion-row {
  display: flex;
  gap: var(--space-m);
  align-items: center;
}

.motion-row__label {
  flex: 0 0 4rem;
  color: var(--ink-faint);
}

.motion-row__dot {
  inline-size: 0.75rem;
  block-size: 0.75rem;
  background: var(--accent);
  transition-property: transform;
  transition-timing-function: var(--ease-out);
}

.motion-row__dot[data-shifted='true'] {
  transform: translateX(12rem);
}

/* ── Demo scaffolding ── */
.demo {
  border: 1px dashed var(--rule-strong);
  padding: var(--space-s);
}

.demo__box,
.demo__tag {
  background: var(--surface-raised);
  border: 1px solid var(--rule);
  padding: var(--space-xs) var(--space-s);
  font-size: var(--text-sm);
  color: var(--ink-muted);
}

.demo__tag {
  font-size: var(--text-xs);
}

.demo__frame {
  border: 1px solid var(--rule);
}

.demo__fill {
  display: grid;
  place-items: center;
  block-size: 100%;
  background: var(--surface-raised);
  color: var(--ink-faint);
  font-size: var(--text-xs);
  letter-spacing: var(--tracking-wide);
  text-transform: uppercase;
}

.demo__measure {
  background: var(--surface-raised);
  border: 1px solid var(--rule);
  padding-block: var(--space-2xs);
  font-size: var(--text-xs);
  color: var(--ink-faint);
  text-align: center;
}

/* The one button style in the system so far. A real component when something
   beyond this page needs one. */
.button {
  border: 1px solid var(--rule-strong);
  padding: var(--space-2xs) var(--space-s);
  font-size: var(--text-sm);
  color: var(--ink);
  transition: border-color var(--duration-quick) var(--ease-out);
}

.button:hover {
  border-color: var(--ink-faint);
}

input,
select {
  background: var(--surface-raised);
  border: 1px solid var(--rule-strong);
  padding: var(--space-2xs) var(--space-s);
  font-size: var(--text-sm);
}
</style>
