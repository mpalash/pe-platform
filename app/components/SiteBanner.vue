<script setup lang="ts">
/**
 * A marquee across the top of the viewport, for upcoming exhibitions and
 * showings.
 *
 * The scrolling mechanics come from `useMarquee`, shared with the supporters
 * block — the copy count and seam distance are the parts that rot when
 * duplicated, so there is one implementation of them.
 *
 * It is the one piece of chrome that is NOT draggable. Everything else floats
 * because it covers content and has to be movable; this reserves its own strip
 * and pushes the rest down, so it never covers anything to begin with.
 */
import type { Announcement } from '~~/server/api/content/announcement.get'

const { data: announcement } = await useFetch<Announcement>('/api/content/announcement', {
  key: 'site-announcement',
  default: (): Announcement => ({ enabled: false, speed: 'slow', items: [] }),
})

const items = computed(() => announcement.value?.items ?? [])
const visible = computed(() => Boolean(announcement.value?.enabled) && items.value.length > 0)

const viewportEl = useTemplateRef<HTMLElement>('viewportEl')
const groupEl = useTemplateRef<HTMLElement>('groupEl')

const { repeats, duration } = useMarquee({
  viewport: viewportEl,
  group: groupEl,
  count: computed(() => items.value.length),
  speed: computed(() => announcement.value?.speed),
})

/* ── the strip everything else has to clear ────────────────────────────── */

const banner = useSiteBanner()
const root = useTemplateRef<HTMLElement>('root')

function publishHeight(): void {
  banner.setHeight(visible.value ? (root.value?.offsetHeight ?? 0) : 0)
}

let resizeObserver: ResizeObserver | null = null

onMounted(() => {
  nextTick(publishHeight)

  // The strip grows if the type wraps at a narrow width, so its height is
  // observed rather than assumed.
  if (root.value) {
    resizeObserver = new ResizeObserver(publishHeight)
    resizeObserver.observe(root.value)
  }
})

// Content arriving late, or the banner being switched off, both change it.
watch(visible, () => nextTick(publishHeight))

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  banner.setHeight(0)
})
</script>

<template>
  <aside
    v-if="visible"
    ref="root"
    class="banner"
    aria-label="Announcements"
  >
    <div
      ref="viewportEl"
      class="banner__viewport"
    >
      <div
        class="banner__track"
        :style="{ '--marquee-repeats': repeats, '--marquee-duration': duration }"
      >
        <!--
          The first copy is rendered explicitly and the rest in a v-for, rather
          than one loop with a conditional ref. A dynamic `:ref` inside v-for is
          collected as an array and does not resolve through useTemplateRef —
          it broke hydration outright. BlockMarquee already does it this way.
        -->
        <div
          ref="groupEl"
          class="banner__group"
        >
          <span
            v-for="(item, index) in items"
            :key="`first-${index}`"
            class="banner__item"
          >
            <a
              v-if="item.url"
              :href="item.url"
              class="banner__link"
              rel="noopener"
            >{{ item.text }}</a>
            <template v-else>{{ item.text }}</template>
          </span>
        </div>

        <!--
          Duplicates, purely to make the loop seamless. Hidden from assistive
          tech and out of the tab order so each announcement is heard once.
        -->
        <div
          v-for="copy in repeats - 1"
          :key="`copy-${copy}`"
          class="banner__group"
          aria-hidden="true"
          inert
        >
          <span
            v-for="(item, index) in items"
            :key="`${copy}-${index}`"
            class="banner__item"
          >{{ item.text }}</span>
        </div>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.banner {
  position: fixed;
  inset-block-start: 0;
  inset-inline: 0;
  z-index: 60;

  background: var(--accent);
  color: var(--ink-inverse);
  border-block-end: 1px solid var(--rule-strong);
}

.banner__viewport {
  overflow: hidden;
  /* Fade the ends so entries enter and leave rather than being sliced off. */
  mask-image: linear-gradient(
    to right,
    transparent,
    black var(--space-l),
    black calc(100% - var(--space-l)),
    transparent
  );
}

.banner__track {
  display: flex;
  inline-size: max-content;
  animation: banner-scroll var(--marquee-duration, 30s) linear infinite;
}

/* A line you are trying to read — or click — should stop running away. */
.banner__viewport:hover .banner__track,
.banner__track:focus-within {
  animation-play-state: paused;
}

.banner__group {
  display: flex;
  flex: none;
}

.banner__item {
  padding-block: var(--space-2xs);
  padding-inline: var(--space-l);
  font-size: var(--text-2xs);
  letter-spacing: var(--tracking-wide);
  text-transform: uppercase;
  white-space: nowrap;
}

.banner__link {
  color: inherit;
  text-decoration-color: color-mix(in srgb, currentcolor 50%, transparent);
}

.banner__link:hover {
  text-decoration-color: currentcolor;
}

.banner__link:focus-visible {
  outline-color: var(--ink-inverse);
}

@keyframes banner-scroll {
  from { transform: translateX(0); }
  /* Exactly one copy's width, whatever the copy count — that is what makes the
     seam invisible. A hard -50% only works with exactly two copies. */
  to { transform: translateX(calc(-100% / var(--marquee-repeats, 2))); }
}

/*
 * Reduced motion stops it entirely rather than slowing it, and lays the
 * entries out as a wrapping row so every one stays readable. These are dates
 * people may be planning around; a marquee that keeps moving for someone who
 * asked it not to has failed at the only thing that mattered.
 */
@media (prefers-reduced-motion: reduce) {
  .banner__viewport {
    mask-image: none;
  }

  .banner__track {
    animation: none;
    inline-size: 100%;
    flex-wrap: wrap;
    justify-content: center;
  }

  .banner__group:not(:first-child) {
    display: none;
  }

  .banner__item {
    white-space: normal;
  }
}
</style>
