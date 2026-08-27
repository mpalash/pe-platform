<script setup lang="ts">
/**
 * The site chrome: a floating, draggable panel rather than a bar across the top.
 *
 * It overlays the content instead of displacing it, which is what lets the
 * archive views run edge to edge. Because it overlays, it has to be movable —
 * anything fixed in a corner eventually covers the one thing you want to see.
 * `useDraggable` owns the movement and the containment; this file owns layout.
 *
 * The mark doubles as the drag handle. It is a <button>, not the home link, so
 * that dragging never risks navigating; home is a separate link beneath it.
 * The hamburger is a real <button> with aria-expanded (hard rule 11).
 */
const navOpen = ref(false)
const route = useRoute()

// Close the menu on navigation, or it stays open behind the new page.
watch(() => route.path, () => {
  navOpen.value = false
})

const { data: pages } = await useFetch('/api/content/pages', { default: () => [] })
const { data: settings } = await useSiteSettings()

const auth = useAuth()
const authModal = useAuthModal()

// Identity is read from the server on mount — the cookie is HttpOnly, so the
// client cannot know whether it is signed in without asking.
onMounted(() => auth.refresh())

/**
 * Navigation is authored in Directus when the `navigation` singleton has links,
 * and falls back to the page tree when it does not. The fallback matters: an
 * empty singleton on a fresh database should still produce a usable site
 * rather than a panel with nothing in it.
 */
const links = computed(() => {
  const authored = settings.value?.nav_links ?? []

  if (authored.length > 0) {
    return authored.map(link => ({ to: link.path, label: link.label, external: link.external }))
  }

  return [
    // The archive is not a Directus page — it is an application route with its
    // own data source — so it is named here rather than coming from the tree.
    { to: '/archive', label: 'Archive', external: false },
    ...(pages.value ?? [])
      .filter(page => !page.parent && page.path !== '/')
      .map(page => ({ to: page.path, label: page.title, external: false })),
  ]
})

const wordmark = computed(() => settings.value?.site_name ?? 'purgatory EDIT')

const { panel, style, handleProps, dragging, reclamp } = useDraggable({
  id: 'site-header',
  initial: { x: 24, y: 24 },
})

// Opening or closing the menu changes the panel's height, which can push its
// bottom edge past the window. Re-clamp once the new height is laid out.
watch(navOpen, () => nextTick(reclamp))
</script>

<template>
  <header
    ref="panel"
    class="site-header"
    :class="{ 'site-header--dragging': dragging }"
    :style="style"
  >
    <!--
      role="toolbar" would be wrong; this is a grab handle that also responds to
      arrow keys. The label says so, because "purgatory EDIT" alone gives a
      keyboard user no hint that the key does anything.
    -->
    <button
      type="button"
      class="site-header__handle"
      aria-label="Move this panel. Use the arrow keys to reposition, Home to reset."
      v-bind="handleProps"
    >
      <span class="site-header__mark">{{ wordmark }}</span>
      <svg
        class="site-header__grip"
        viewBox="0 0 16 16"
        width="12"
        height="12"
        aria-hidden="true"
      >
        <g fill="currentColor">
          <circle cx="6" cy="4" r="1" />
          <circle cx="10" cy="4" r="1" />
          <circle cx="6" cy="8" r="1" />
          <circle cx="10" cy="8" r="1" />
          <circle cx="6" cy="12" r="1" />
          <circle cx="10" cy="12" r="1" />
        </g>
      </svg>
    </button>

    <button
      type="button"
      class="site-header__toggle"
      :aria-expanded="navOpen"
      aria-controls="site-nav"
      @click="navOpen = !navOpen"
    >
      {{ navOpen ? 'Close' : 'Menu' }}
      <span class="visually-hidden"> navigation</span>
    </button>

    <div
      id="site-nav"
      class="site-header__body"
      :data-open="navOpen"
    >
      <nav aria-label="Primary">
        <ul
          class="site-header__list"
          role="list"
        >
          <li>
            <NuxtLink
              to="/"
              class="site-header__link"
            >
              Home
            </NuxtLink>
          </li>
          <li
            v-for="link in links"
            :key="link.to"
          >
            <a
              v-if="link.external"
              :href="link.to"
              class="site-header__link"
              rel="noopener"
            >{{ link.label }}</a>
            <NuxtLink
              v-else
              :to="link.to"
              class="site-header__link"
            >
              {{ link.label }}
            </NuxtLink>
          </li>
        </ul>
      </nav>

      <div class="site-header__account">
        <template v-if="auth.signedIn.value">
          <span class="site-header__who">{{ auth.user.value?.name || auth.user.value?.email }}</span>
          <button
            type="button"
            class="site-header__auth"
            @click="auth.signOut()"
          >
            Sign out
          </button>
        </template>
        <button
          v-else
          type="button"
          class="site-header__auth"
          @click="authModal.openSignIn()"
        >
          Sign in
        </button>
      </div>
    </div>
  </header>
</template>

<style scoped>
.site-header {
  position: fixed;
  z-index: 40;
  inline-size: max-content;
  min-inline-size: 9rem;
  max-inline-size: 15rem;

  display: flex;
  flex-direction: column;
  gap: var(--space-s);

  padding: var(--space-s);
  background: color-mix(in srgb, var(--surface) 88%, transparent);
  border: 1px solid var(--rule);
  /* The panel floats over video and a black galaxy, so it needs to separate
     itself from both. A backdrop blur does that without an opaque slab. */
  backdrop-filter: blur(12px);
}

.site-header--dragging {
  border-color: var(--rule-strong);
  /* Text selection during a drag turns the whole panel blue and is never
     what was meant. */
  user-select: none;
}

.site-header__handle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-s);
  inline-size: 100%;
  padding: 0;
  cursor: grab;
  text-align: start;
  touch-action: none; /* or the browser scrolls instead of dragging */
}

.site-header--dragging .site-header__handle {
  cursor: grabbing;
}

.site-header__mark {
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
  letter-spacing: var(--tracking-wide);
  text-transform: uppercase;
  color: var(--ink);
}

.site-header__grip {
  flex: none;
  color: var(--ink-faint);
}

.site-header__handle:hover .site-header__grip {
  color: var(--ink-muted);
}

.site-header__body {
  display: flex;
  flex-direction: column;
  gap: var(--space-s);
}

/* Links stack vertically — the panel is a column, not a bar. */
.site-header__list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2xs);
}

.site-header__link {
  display: block;
  font-size: var(--text-sm);
  color: var(--ink-muted);
  text-decoration: none;
}

.site-header__link:hover,
.site-header__link.router-link-active {
  color: var(--ink);
}

.site-header__account {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-2xs);
  padding-block-start: var(--space-s);
  border-block-start: 1px solid var(--rule);
}

.site-header__who {
  font-size: var(--text-2xs);
  color: var(--ink-faint);
  max-inline-size: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.site-header__auth,
.site-header__toggle {
  font-size: var(--text-2xs);
  letter-spacing: var(--tracking-wide);
  text-transform: uppercase;
  color: var(--ink-muted);
  text-align: start;
}

.site-header__auth:hover,
.site-header__toggle:hover {
  color: var(--accent);
}

/*
 * The toggle only earns its place on a phone, where a floating panel showing
 * every link covers most of the screen. Above that the panel is small enough
 * to stay open, so the toggle is hidden and the nav is always present.
 */
@media (width < 34rem) {
  .site-header__body {
    display: none;
  }

  .site-header__body[data-open='true'] {
    display: flex;
  }
}

@media (width >= 34rem) {
  .site-header__toggle {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .site-header {
    backdrop-filter: none;
    background: var(--surface);
  }
}
</style>
