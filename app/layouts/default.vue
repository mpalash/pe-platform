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

    <SiteFooter />
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
