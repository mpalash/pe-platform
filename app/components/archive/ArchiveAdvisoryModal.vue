<script setup lang="ts">
/**
 * The archive's content warning, as a modal over the loading archive.
 *
 * It sits over the archive rather than replacing it so the 18MB dataset, the
 * thumbnails and the first clips are all fetching while this is being read —
 * accepting then costs no wait. The background is blurred by the scrim's
 * `backdrop-filter`, so what is loading is visible as movement and shape
 * without being legible as content.
 *
 * Three departures from AuthModal, all for the same reason: this is a consent
 * gate, not a dialog.
 *
 *   - Escape does not close it.
 *   - Clicking the scrim does not close it.
 *   - There is no close button.
 *
 * The only ways out are accepting or leaving, which is what makes the choice a
 * choice. `useActivePlayer` refuses to start any clip until it is accepted, so
 * nothing plays behind the blur in the meantime.
 *
 * Copy comes from Directus (`archive_advisory`) — a content warning should not
 * need a deploy to change.
 */
import type { ArchiveAdvisory } from '~~/server/api/content/archive-advisory.get'

const advisory = useArchiveAdvisory()

const { data: content } = await useFetch<ArchiveAdvisory>('/api/content/archive-advisory', {
  key: 'archive-advisory',
})

const dialog = useTemplateRef<HTMLElement>('dialog')
const acceptButton = useTemplateRef<HTMLElement>('acceptButton')

/* ── focus containment ─────────────────────────────────────────────────── */

const FOCUSABLE = 'a[href], button:not([disabled]), summary, [tabindex]:not([tabindex="-1"])'

/**
 * Tab is trapped, but Escape is not handled at all.
 *
 * The archive behind this also carries `inert`, which is what actually removes
 * it from the tab order and the accessibility tree. This trap is the belt to
 * that braces: `inert` is well supported now, but a gate that leaks focus into
 * material someone has not consented to see is not a failure worth risking on
 * one attribute.
 */
function onKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Tab' || !dialog.value) return

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
  // The archive scrolls; the modal must not scroll it.
  document.body.style.overflow = 'hidden'
  nextTick(() => acceptButton.value?.focus())
})

onBeforeUnmount(() => {
  document.body.style.overflow = ''
  previouslyFocused?.focus?.()
})
</script>

<template>
  <div
    v-if="content"
    ref="dialog"
    class="advisory-gate"
    role="dialog"
    aria-modal="true"
    aria-labelledby="advisory-title"
    @keydown="onKeydown"
  >
    <!--
      No click handler. Dismissing a content warning by clicking beside it is
      not consent, it is an accident.
    -->
    <div class="advisory-gate__scrim scrim" />

    <div class="advisory-gate__panel frosted">
      <Stack space="m">
        <h1
          id="advisory-title"
          class="advisory-gate__title"
        >
          {{ content.title }}
        </h1>

        <p
          v-if="content.lede"
          class="advisory-gate__lede"
        >
          {{ content.lede }}
        </p>

        <!-- eslint-disable-next-line vue/no-v-html -- authored in Directus by an
             editor with access to the admin; the same trust boundary as every
             other rich-text block on the site. -->
        <div
          class="advisory-gate__body prose"
          v-html="content.body"
        />

        <details
          v-if="content.detail"
          class="advisory-gate__detail"
        >
          <summary>{{ content.detail_label }}</summary>
          <p>{{ content.detail }}</p>
        </details>

        <Cluster space="s">
          <button
            ref="acceptButton"
            type="button"
            class="advisory-gate__enter"
            @click="advisory.accept()"
          >
            {{ content.accept_label }}
          </button>
          <NuxtLink
            :to="content.decline_path"
            class="advisory-gate__leave"
          >
            {{ content.decline_label }}
          </NuxtLink>
        </Cluster>
      </Stack>
    </div>
  </div>
</template>

<style scoped>
.advisory-gate {
  position: fixed;
  inset: 0;
  z-index: 120;
  display: grid;
  place-items: center;
  padding: var(--space-m);
}

/*
 * Entirely `.scrim` in primitives.css — positioning, opacity, blur and the
 * no-backdrop-filter fallback.
 *
 * The shared 70%/16px is what keeps the loading archive readable as movement
 * and shape — evidence that waiting is not what accepting will cost — without
 * resolving into content nobody has consented to see yet. That happens to be
 * what every other modal wants too, so nothing here is special-cased.
 */

.advisory-gate__panel {
  /* Level 4, the top of the scale, and the largest gap in it: a dialog reads
     as being in front of the whole page rather than one step above it. Glass
     and border come from `.frosted` in primitives.css. */
  --elevation: var(--shadow-4);
  --frost-base: var(--surface-raised);

  position: relative;
  inline-size: min(34rem, 100%);
  max-block-size: calc(100dvh - var(--space-2xl));
  overflow-y: auto;
  padding: var(--space-xl);
}

.advisory-gate__title {
  font-size: var(--text-xl);
}

.advisory-gate__lede {
  font-size: var(--text-md);
  line-height: var(--leading-snug);
  color: var(--ink-muted);
}

.advisory-gate__body {
  border-inline-start: 2px solid var(--accent);
  padding-inline-start: var(--space-l);
  font-size: var(--text-sm);
  color: var(--ink-muted);
}

.advisory-gate__detail {
  font-size: var(--text-sm);
  color: var(--ink-muted);
}

.advisory-gate__detail summary {
  cursor: pointer;
  font-size: var(--text-2xs);
  letter-spacing: var(--tracking-wide);
  text-transform: uppercase;
  color: var(--ink-faint);
}

.advisory-gate__detail summary:hover {
  color: var(--ink);
}

.advisory-gate__detail p {
  margin-block-start: var(--space-s);
  line-height: var(--leading-normal);
}

.advisory-gate__enter {
  border: 1px solid var(--accent);
  background: var(--accent);
  color: var(--ink-inverse);
  padding: var(--space-2xs) var(--space-l);
  font-size: var(--text-2xs);
  letter-spacing: var(--tracking-wide);
  text-transform: uppercase;
}

.advisory-gate__leave {
  font-size: var(--text-2xs);
  letter-spacing: var(--tracking-wide);
  text-transform: uppercase;
  color: var(--ink-faint);
  text-decoration: none;
}

.advisory-gate__leave:hover {
  color: var(--ink);
}
</style>
