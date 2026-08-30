<script setup lang="ts">
/**
 * A continuously scrolling row of supporters.
 *
 * Two things make this honest rather than decorative:
 *
 * 1. **Reduced motion stops it entirely.** Not "slower" — stopped, and laid out
 *    as a wrapping row instead, so every name is still readable. A marquee that
 *    keeps moving for someone who asked it not to has failed at its only
 *    accessibility obligation, and these are credits: they must be legible.
 *
 * 2. **Hovering or focusing pauses it.** A name you are trying to read or click
 *    should stop running away from you.
 *
 * The list is repeated enough times to overflow the viewport and translated by
 * exactly one copy's width, which is what makes the loop seamless. Every copy
 * after the first is `aria-hidden` and out of the tab order, so a screen reader
 * hears each supporter once.
 */
interface MarqueeItem {
  name: string
  image?: string | null
  url?: string | null
}

const props = defineProps<{
  title?: string | null
  anchor?: string | null
  speed?: string | null
  direction?: string | null
  items?: MarqueeItem[] | null
}>()

const config = useRuntimeConfig()

const entries = computed(() => props.items ?? [])

// Repeat count, seam distance and duration all live in useMarquee — the
// announcement banner needs exactly the same behaviour.
const viewportEl = useTemplateRef<HTMLElement>('viewportEl')
const groupEl = useTemplateRef<HTMLElement>('groupEl')

const { repeats, duration, reversed } = useMarquee({
  viewport: viewportEl,
  group: groupEl,
  count: computed(() => entries.value.length),
  speed: computed(() => props.speed),
  direction: computed(() => props.direction),
})

function src(item: MarqueeItem): string | null {
  return item.image ? `${config.public.directusUrl}/assets/${item.image}` : null
}
</script>

<template>
  <section
    class="marquee"
    :aria-labelledby="anchor ?? undefined"
  >
    <!-- Title sits at the page measure, not the viewport gutter: every other
         block on the page shares that left edge, and a marquee heading floating
         out at the window edge reads as a mistake rather than a decision. The
         scrolling track itself stays full-bleed, which is the point of it. -->
    <Center>
      <h2
        v-if="title"
        :id="anchor ?? undefined"
        class="marquee__title"
      >
        {{ title }}
      </h2>
    </Center>

    <div
      ref="viewportEl"
      class="marquee__viewport"
      :style="{ '--marquee-duration': duration, '--marquee-repeats': repeats }"
      :data-reversed="reversed"
    >
      <div class="marquee__track">
        <ul
          ref="groupEl"
          class="marquee__group"
          role="list"
        >
          <li
            v-for="item in entries"
            :key="item.name"
            class="marquee__item"
          >
            <component
              :is="item.url ? 'a' : 'span'"
              :href="item.url ?? undefined"
              :rel="item.url ? 'noreferrer' : undefined"
              class="marquee__link"
            >
              <img
                v-if="src(item)"
                :src="src(item)!"
                :alt="item.name"
                loading="lazy"
              >
              <span v-else>{{ item.name }}</span>
            </component>
          </li>
        </ul>

        <!--
          Copies exist only to make the loop seamless. They are hidden from
          assistive technology and from the tab order, or every supporter would
          be announced and focusable several times over.
        -->
        <ul
          v-for="copy in repeats - 1"
          :key="`copy-${copy}`"
          class="marquee__group"
          aria-hidden="true"
          role="list"
        >
          <li
            v-for="item in entries"
            :key="`${item.name}-${copy}`"
            class="marquee__item"
          >
            <span
              class="marquee__link"
              tabindex="-1"
            >
              <img
                v-if="src(item)"
                :src="src(item)!"
                alt=""
                loading="lazy"
              >
              <span v-else>{{ item.name }}</span>
            </span>
          </li>
        </ul>
      </div>
    </div>
  </section>
</template>

<style scoped>
.marquee__title {
  font-size: var(--text-base);
  font-weight: var(--weight-medium);
  letter-spacing: var(--tracking-wide);
  text-transform: uppercase;
  color: var(--ink-muted);
  margin-block-end: var(--space-m);
}

.marquee__viewport {
  overflow: hidden;
  /* Fade the ends so items enter and leave rather than being sliced off. */
  mask-image: linear-gradient(
    to right,
    transparent,
    black var(--space-2xl),
    black calc(100% - var(--space-2xl)),
    transparent
  );
}

.marquee__track {
  display: flex;
  inline-size: max-content;
  animation: marquee-scroll var(--marquee-duration, 30s) linear infinite;
}

.marquee__viewport[data-reversed='true'] .marquee__track {
  animation-direction: reverse;
}

/* Pause for anyone reading or tabbing through. */
.marquee__viewport:hover .marquee__track,
.marquee__viewport:focus-within .marquee__track {
  animation-play-state: paused;
}

.marquee__group {
  display: flex;
  gap: var(--space-2xl);
  align-items: center;
  padding-inline-end: var(--space-2xl);
  list-style: none;
  margin: 0;
}

.marquee__item {
  flex: none;
}

.marquee__link {
  display: block;
  font-size: var(--text-sm);
  letter-spacing: var(--tracking-wide);
  color: var(--ink-muted);
  text-decoration: none;
  white-space: nowrap;
  transition: color var(--duration-quick) var(--ease-out);
}

a.marquee__link:hover,
a.marquee__link:focus-visible {
  color: var(--ink);
}

.marquee__link img {
  block-size: 2.25rem;
  inline-size: auto;
  /* Supporter logos arrive in every colour. Desaturating treats them equally
     and keeps them legible on a dark ground. */
  filter: grayscale(1) brightness(0) invert(0.85);
  opacity: 0.7;
  transition: opacity var(--duration-quick) var(--ease-out);
}

a.marquee__link:hover img,
a.marquee__link:focus-visible img {
  opacity: 1;
}

@keyframes marquee-scroll {
  from { transform: translateX(0); }
  /*
   * Exactly ONE copy's width, whatever the copy count — that is what makes the
   * seam invisible. A hard -50% only works when there are exactly two copies.
   */
  to { transform: translateX(calc(-100% / var(--marquee-repeats, 2))); }
}

/*
 * Reduced motion: stop, and re-lay-out as a wrapping row.
 *
 * The duplicate group is removed rather than hidden — with no animation it
 * would simply repeat every name on the page.
 */
@media (prefers-reduced-motion: reduce) {
  .marquee__viewport {
    mask-image: none;
  }

  .marquee__track {
    animation: none;
    inline-size: 100%;
    flex-wrap: wrap;
  }

  .marquee__group[aria-hidden='true'] {
    display: none;
  }

  .marquee__group {
    flex-wrap: wrap;
    gap: var(--space-l) var(--space-2xl);
  }
}
</style>
