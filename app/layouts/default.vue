<script setup lang="ts">
const authModal = useAuthModal()
const ambient = useAmbientVideo()
</script>

<template>
  <div class="layout">
    <!--
      The skip link is the first focusable thing on every page. It targets
      #main, which is why <main> below carries that id and tabindex="-1" —
      without the tabindex, focus does not actually move in some browsers.
    -->
    <a
      href="#main"
      class="skip-link"
    >Skip to content</a>

    <SiteHeader />

    <main
      id="main"
      tabindex="-1"
    >
      <slot />
    </main>

    <!--
      No footer, for now. SiteFooter.vue is left in the repo rather than
      deleted — "for now" reads as temporary, and the component is unchanged
      and ready to drop back in by restoring this one line.
    -->

    <!-- Mounted once at the layout level so any page can summon it, and so it
         survives navigation between pages. -->
    <AuthModal v-if="authModal.isOpen.value" />

    <!--
      Mounted here rather than per page so that navigating does not restart the
      clip. ClientOnly because a <video> has nothing to render on the server,
      and because the player reads the window height to open at the bottom left.
    -->
    <ClientOnly>
      <AmbientVideo v-if="ambient.enabled.value" />
    </ClientOnly>
  </div>
</template>

<style scoped>
.layout {
  display: flex;
  min-block-size: 100svh;
  flex-direction: column;
}

.layout > main {
  /* Push the footer to the bottom on short pages without positioning it. */
  flex: 1;
}

/*
 * The one deliberate `outline: none` in the codebase, and the reason it is
 * allowed: <main> is a skip-link TARGET, not a control. Focus lands here so a
 * screen reader starts reading in the right place; ringing the entire page
 * region would be noise, and it is the convention GOV.UK settled on. Every
 * actual interactive element keeps its :focus-visible ring.
 */
main {
  outline: none;
}
</style>
