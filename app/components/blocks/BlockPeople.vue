<script setup lang="ts">
/**
 * Named people with roles. About uses this twice — the core team, and
 * institutional collaborators — with different framing but the same shape.
 */
interface Person {
  name: string
  role?: string | null
  url?: string | null
}

const props = defineProps<{
  title?: string | null
  anchor?: string | null
  intro?: string | null
  people?: Person[] | null
}>()

const items = computed(() => props.people ?? [])
</script>

<template>
  <Center as="section">
    <Stack space="l">
      <h2
        v-if="title"
        :id="anchor ?? undefined"
      >
        {{ title }}
      </h2>

      <!-- eslint-disable-next-line vue/no-v-html -- trusted editor content -->
      <div
        v-if="intro"
        class="prose"
        v-html="intro"
      />

      <Grid
        as="ul"
        min="14rem"
        space="l"
        role="list"
        class="people"
      >
        <li
          v-for="person in items"
          :key="person.name"
        >
          <p class="people__name">
            <a
              v-if="person.url"
              :href="person.url"
              rel="noreferrer"
            >{{ person.name }}</a>
            <span v-else>{{ person.name }}</span>
          </p>
          <p
            v-if="person.role"
            class="people__role"
          >
            {{ person.role }}
          </p>
        </li>
      </Grid>
    </Stack>
  </Center>
</template>

<style scoped>
.people__name {
  font-weight: var(--weight-medium);
}

.people__role {
  font-size: var(--text-sm);
  color: var(--ink-muted);
  text-wrap: pretty;
}
</style>
