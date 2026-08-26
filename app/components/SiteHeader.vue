<script setup lang="ts">
/**
 * Provisional, and honestly so. Real navigation depends on the content
 * hierarchy Phase 4 designs — building a mega-menu against imagined content
 * would be building the wrong thing carefully.
 *
 * The hamburger is a real <button> with aria-expanded, not an <a href="#">.
 * That is hard rule 11, and it is cheaper now than as a retrofit.
 */
const navOpen = ref(false)
const route = useRoute()

// Close the menu on navigation, or it stays open behind the new page.
watch(() => route.path, () => {
  navOpen.value = false
})

/**
 * Navigation comes from the page tree, not a hand-kept list — top-level pages
 * only, in their authored sort order. Still provisional: the real hierarchy is
 * a Phase 4 content-design output, and this will be revised once it settles.
 */
const { data: pages } = await useFetch('/api/content/pages', { default: () => [] })

const auth = useAuth()
const authModal = useAuthModal()

// Identity is read from the server on mount — the cookie is HttpOnly, so the
// client cannot know whether it is signed in without asking.
onMounted(() => auth.refresh())

const links = computed(() => [
  // The archive is not a Directus page — it is an application route with its
  // own data source — so it is named here rather than coming from the tree.
  { to: '/archive', label: 'Archive' },
  ...(pages.value ?? [])
    .filter(page => !page.parent && page.path !== '/')
    .map(page => ({ to: page.path, label: page.title })),
  // /reference is deliberately absent. The design-system reference page still
  // exists and is still the thing to look at when judging a token change — it
  // is just developer documentation, not somewhere a visitor should be sent.
])
</script>

<template>
  <header class="site-header">
    <div class="center center--full site-header__inner">
      <NuxtLink
        to="/"
        class="site-header__mark"
      >
        pe—platform
      </NuxtLink>

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
        <template v-else>
          <button
            type="button"
            class="site-header__auth"
            @click="authModal.openSignIn()"
          >
            Sign in
          </button>
          <button
            type="button"
            class="site-header__auth"
            @click="authModal.openRegister()"
          >
            Register
          </button>
        </template>
      </div>

      <nav
        id="site-nav"
        class="site-header__nav"
        :data-open="navOpen"
        aria-label="Primary"
      >
        <Cluster
          as="ul"
          space="l"
          role="list"
        >
          <li
            v-for="link in links"
            :key="link.to"
          >
            <NuxtLink
              :to="link.to"
              class="site-header__link"
            >
              {{ link.label }}
            </NuxtLink>
          </li>
        </Cluster>
      </nav>
    </div>
  </header>
</template>

<style scoped>
.site-header {
  border-block-end: 1px solid var(--rule);
  padding-block: var(--space-m);
}

.site-header__inner {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-m);
}

.site-header__mark {
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
  letter-spacing: var(--tracking-wide);
  text-transform: uppercase;
  text-decoration: none;
  color: var(--ink);
}

.site-header__link {
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
  gap: var(--space-s);
  align-items: baseline;
  order: 3;
}

.site-header__who {
  font-size: var(--text-2xs);
  color: var(--ink-faint);
  max-inline-size: 12rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.site-header__auth {
  font-size: var(--text-2xs);
  letter-spacing: var(--tracking-wide);
  text-transform: uppercase;
  color: var(--ink-muted);
}

.site-header__auth:hover {
  color: var(--accent);
}

.site-header__toggle {
  font-size: var(--text-xs);
  letter-spacing: var(--tracking-wide);
  text-transform: uppercase;
  color: var(--ink-muted);
}

/* Below the fold of a phone the nav collapses behind the toggle. Above it, the
   toggle is hidden and the nav is always present — no JS involved either way. */
@media (width < 34rem) {
  .site-header__nav {
    display: none;
    flex-basis: 100%;
  }

  .site-header__nav[data-open='true'] {
    display: block;
  }
}

@media (width >= 34rem) {
  .site-header__toggle {
    display: none;
  }
}
</style>
