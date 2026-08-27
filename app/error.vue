<script setup lang="ts">
import type { NuxtError } from '#app'

/**
 * The error page — 404s and everything else.
 *
 * Nuxt renders this OUTSIDE the normal layout tree, so it has to bring its own
 * chrome. That is also why it repeats a little structure rather than reusing
 * the default layout: wrapping it in <NuxtLayout> here re-runs the layout's
 * data fetching during an error, which is exactly when the backend may be the
 * thing that is broken.
 */
const props = defineProps<{ error: NuxtError }>()

const status = computed(() => Number(props.error?.statusCode ?? 500))
const isNotFound = computed(() => status.value === 404)

const headline = computed(() => (isNotFound.value ? 'No such page' : 'Something broke'))

const explanation = computed(() => {
  if (isNotFound.value) {
    return 'The address is wrong, the page was unpublished, or it never existed. '
      + 'None of those are your fault.'
  }

  if (status.value === 503) {
    return 'The content backend is not answering. If you are running this locally, '
      + 'check that `docker compose up` is still going.'
  }

  return 'An unexpected error. The details are in the server log.'
})

useSeoMeta({
  title: () => `${status.value} — ${headline.value}`,
  robots: 'noindex',
})

/** Suggestions, not a sitemap. Four is enough to be useful. */
const elsewhere = [
  { to: '/', label: 'Home' },
  { to: '/archive', label: 'The Archive' },
  { to: '/about', label: 'About the project' },
  { to: '/faqs', label: 'Frequently asked questions' },
]

/**
 * Every route away from here goes through `clearError`.
 *
 * A plain <NuxtLink> does NOT work on an error page: Nuxt keeps the error state
 * until it is explicitly cleared, so the URL changes and this page stays on
 * screen. The visitor is then stuck on a 404 that follows them around, which is
 * a considerably worse bug than the missing page they arrived for.
 */
async function leave(to: string): Promise<void> {
  await clearError({ redirect: to })
}

async function goBack(): Promise<void> {
  // history.back() alone leaves the error mounted, so clear first and only fall
  // back to history when there is somewhere to go back to.
  if (import.meta.client && window.history.length > 1) {
    await clearError()
    window.history.back()
    return
  }

  await leave('/')
}
</script>

<template>
  <div class="error-page">
    <header class="error-page__chrome">
      <Center measure="full">
        <a
          href="/"
          class="error-page__mark"
          @click.prevent="leave('/')"
        >
          purgatory EDIT
        </a>
      </Center>
    </header>

    <main class="error-page__main">
      <Center>
        <Stack space="l">
          <!--
            The status code is the loudest thing on the page on purpose. In an
            austere register, the number is the graphic — no illustration, no
            apology, no "oops".
          -->
          <p
            class="error-page__code"
            aria-hidden="true"
          >
            {{ status }}
          </p>

          <Stack space="s">
            <h1 class="error-page__headline">
              <span class="visually-hidden">Error {{ status }}: </span>{{ headline }}
            </h1>
            <p class="error-page__explanation">
              {{ explanation }}
            </p>
          </Stack>

          <Cluster space="s">
            <button
              type="button"
              class="error-page__back"
              @click="goBack"
            >
              Go back
            </button>
            <button
              type="button"
              class="error-page__home"
              @click="leave('/')"
            >
              Start again
            </button>
          </Cluster>

          <nav aria-label="Elsewhere on the site">
            <p class="error-page__elsewhere-label">
              Elsewhere
            </p>
            <Stack
              space="2xs"
              as="ul"
              class="error-page__links"
            >
              <li
                v-for="link in elsewhere"
                :key="link.to"
              >
                <!-- A real link (right-click, middle-click, copy address all
                     work), but the click is intercepted so the error is cleared
                     rather than left mounted over the destination. -->
                <a
                  :href="link.to"
                  @click.prevent="leave(link.to)"
                >
                  {{ link.label }}
                </a>
              </li>
            </Stack>
          </nav>
        </Stack>
      </Center>
    </main>
  </div>
</template>

<style scoped>
.error-page {
  display: flex;
  min-block-size: 100svh;
  flex-direction: column;
  background: var(--surface);
  color: var(--ink);
}

.error-page__chrome {
  border-block-end: 1px solid var(--rule);
  padding-block: var(--space-m);
}

.error-page__mark {
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
  letter-spacing: var(--tracking-wide);
  text-transform: uppercase;
  text-decoration: none;
  color: var(--ink);
}

.error-page__main {
  flex: 1;
  display: flex;
  align-items: center;
  padding-block: var(--space-3xl);
}

.error-page__code {
  font-size: var(--text-3xl);
  font-weight: var(--weight-bold);
  line-height: 1;
  letter-spacing: var(--tracking-tight);
  /* Faint rather than accent: it is a label, not a warning. */
  color: var(--ink-faint);
  font-variant-numeric: tabular-nums;
}

.error-page__headline {
  font-size: var(--text-xl);
}

.error-page__explanation {
  color: var(--ink-muted);
  max-inline-size: var(--measure);
}

.error-page__back {
  border: 1px solid var(--rule-strong);
  padding: var(--space-xs) var(--space-l);
  font-size: var(--text-sm);
  color: var(--ink);
  transition: border-color var(--duration-quick) var(--ease-out);
}

.error-page__back:hover {
  border-color: var(--ink-faint);
}

.error-page__home {
  padding: var(--space-xs) var(--space-s);
  font-size: var(--text-sm);
  color: var(--ink-muted);
  text-decoration: none;
}

.error-page__home:hover {
  color: var(--ink);
}

.error-page__elsewhere-label {
  font-size: var(--text-2xs);
  letter-spacing: var(--tracking-wide);
  text-transform: uppercase;
  color: var(--ink-faint);
  margin-block-end: var(--space-xs);
}

.error-page__links {
  list-style: none;
  padding: 0;
  margin: 0;
}

.error-page__links a {
  font-size: var(--text-sm);
}
</style>
