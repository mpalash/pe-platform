<script setup lang="ts">
// Proves the Nuxt → Nitro → Directus path end to end. (Phase 1 §1.4)
const { data: status, error } = await useFetch('/api/status')
</script>

<template>
  <main>
    <h1>pe-platform</h1>
    <p>Phase 1 — foundation. Unstyled on purpose.</p>

    <h2>Directus connection</h2>
    <p v-if="error">
      Not reachable: {{ error.statusMessage ?? error.message }}
    </p>
    <dl v-else-if="status">
      <dt>Connected</dt>
      <dd>{{ status.connected }}</dd>
      <dt>Project</dt>
      <dd>{{ status.project ?? '—' }}</dd>
      <dt>Directus version</dt>
      <dd>{{ status.directusVersion ?? '—' }}</dd>
    </dl>

    <h2>Spike</h2>
    <p>
      <NuxtLink to="/spike">Magic-link spike</NuxtLink> — throwaway, Phase 1 §1.5.
    </p>
  </main>
</template>
