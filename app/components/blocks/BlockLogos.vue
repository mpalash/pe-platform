<script setup lang="ts">
/**
 * A group of supporter logos under a heading. The home page carries four:
 * funding, development, exhibition and technical support.
 */
interface Logo {
  name: string
  image?: string | null
  url?: string | null
}

const props = defineProps<{
  title?: string | null
  anchor?: string | null
  logos?: Logo[] | null
}>()

const config = useRuntimeConfig()
const items = computed(() => props.logos ?? [])

const src = (logo: Logo) =>
  logo.image ? `${config.public.directusUrl}/assets/${logo.image}` : null
</script>

<template>
  <Center as="section">
    <Stack space="l">
      <h2
        v-if="title"
        :id="anchor ?? undefined"
        class="logos__title"
      >
        {{ title }}
      </h2>

      <Cluster
        as="ul"
        space="xl"
        role="list"
        class="logos"
      >
        <li
          v-for="logo in items"
          :key="logo.name"
        >
          <!--
            The logo name is the alt text as well as the label — a supporter
            whose logo fails to load must still be credited.
          -->
          <component
            :is="logo.url ? 'a' : 'span'"
            :href="logo.url ?? undefined"
            :rel="logo.url ? 'noreferrer' : undefined"
            class="logos__item"
          >
            <img
              v-if="src(logo)"
              :src="src(logo)!"
              :alt="logo.name"
              loading="lazy"
            >
            <span v-else>{{ logo.name }}</span>
          </component>
        </li>
      </Cluster>
    </Stack>
  </Center>
</template>

<style scoped>
.logos__title {
  font-size: var(--text-base);
  font-weight: var(--weight-medium);
  letter-spacing: var(--tracking-wide);
  text-transform: uppercase;
  color: var(--ink-muted);
}

.logos__item {
  display: block;
  text-decoration: none;
}

.logos__item img {
  block-size: 2.5rem;
  inline-size: auto;
  /* Supporter logos arrive in every colour and format. On a dark ground the
     honest options are a light box behind each, or desaturating them to sit
     together. The latter suits the register and treats them equally. */
  filter: grayscale(1) brightness(0) invert(0.85);
  opacity: 0.75;
  transition: opacity var(--duration-quick) var(--ease-out);
}

.logos__item:hover img,
.logos__item:focus-visible img {
  opacity: 1;
}
</style>
