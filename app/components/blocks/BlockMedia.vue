<script setup lang="ts">
/**
 * An image or a video, at a chosen aspect ratio, inline or full-bleed.
 *
 * Two Phase-2 primitives do all the work: Frame reserves the space before the
 * media loads (no layout shift), and Bleed escapes the measure without the page
 * wrapper knowing anything about it.
 */
const props = defineProps<{
  file?: string | null
  video_url?: string | null
  caption?: string | null
  alt?: string | null
  ratio?: string | null
  display?: string | null
  anchor?: string | null
}>()

const config = useRuntimeConfig()

const isBleed = computed(() => props.display === 'bleed')
const ratio = computed(() => props.ratio || '16 / 9')

const imageSrc = computed(() =>
  props.file ? `${config.public.directusUrl}/assets/${props.file}` : null,
)

/**
 * Hard rule 3: an `s3.amazonaws.com` URL reaching a player is a bug. Rather
 * than rendering it and paying $0.09/GB, refuse it — loudly in the console,
 * quietly on the page. The current site has exactly this URL in its
 * performance page, which is how the rule earned its place.
 */
const videoSrc = computed(() => {
  const url = props.video_url
  if (!url) return null

  if (/\.s3[.-][a-z0-9-]*\.amazonaws\.com/i.test(url) || /^https?:\/\/s3[.-]/i.test(url)) {
    console.error('[block_media] refusing a direct S3 video URL — it must go through CloudFront:', url)
    return null
  }

  return url
})

const refused = computed(() => Boolean(props.video_url) && videoSrc.value === null)
</script>

<template>
  <figure class="media">
    <!--
      Two branches rather than a dynamic :is — auto-imported components are not
      in scope as variables in <script setup>, so `:is="Bleed"` would silently
      resolve to nothing.
    -->
    <Bleed v-if="isBleed">
      <Frame
        :ratio="ratio"
        fit="contain"
      >
        <video
          v-if="videoSrc"
          :src="videoSrc"
          controls
          playsinline
          preload="metadata"
        />
        <img
          v-else-if="imageSrc"
          :src="imageSrc"
          :alt="alt ?? ''"
          loading="lazy"
        >
        <p
          v-else-if="refused"
          class="media__refused"
        >
          This video is not available — it is not being served through the CDN.
        </p>
      </Frame>
    </Bleed>

    <Center v-else>
      <Frame
        :ratio="ratio"
        fit="contain"
      >
        <video
          v-if="videoSrc"
          :src="videoSrc"
          controls
          playsinline
          preload="metadata"
        />
        <img
          v-else-if="imageSrc"
          :src="imageSrc"
          :alt="alt ?? ''"
          loading="lazy"
        >
        <p
          v-else-if="refused"
          class="media__refused"
        >
          This video is not available — it is not being served through the CDN.
        </p>
      </Frame>
    </Center>

    <Center v-if="caption">
      <figcaption :id="anchor ?? undefined">
        {{ caption }}
      </figcaption>
    </Center>
  </figure>
</template>

<style scoped>
.media__refused {
  display: grid;
  place-items: center;
  block-size: 100%;
  padding: var(--space-m);
  color: var(--ink-faint);
  font-size: var(--text-sm);
  text-align: center;
}
</style>
