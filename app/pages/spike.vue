<script setup lang="ts">
/**
 * ⚠️ SPIKE PAGE — throwaway. Phase 1 §1.5.
 * No styling, no error handling beyond the happy path. The question it answers
 * is only: does this shape work?
 */
const route = useRoute()

const email = ref('')
const requestState = ref<'idle' | 'sending' | 'sent' | 'failed'>('idle')

const { data: session, refresh: refreshSession } = await useFetch('/api/auth/spike/me')

async function requestLink() {
  requestState.value = 'sending'
  try {
    await $fetch('/api/auth/spike/request', {
      method: 'POST',
      body: { email: email.value },
    })
    requestState.value = 'sent'
  }
  catch {
    requestState.value = 'failed'
  }
}

async function signOut() {
  await $fetch('/api/auth/spike/sign-out', { method: 'POST' })
  await refreshSession()
}
</script>

<template>
  <main>
    <h1>Magic-link spike</h1>

    <template v-if="session?.signedIn">
      <p>Signed in as <strong>{{ session.email }}</strong>.</p>
      <p>Session identity was read server-side from the cookie, not from anything the page sent.</p>
      <button
        type="button"
        @click="signOut"
      >
        Sign out
      </button>
    </template>

    <template v-else>
      <p v-if="route.query.error === 'invalid-link'">
        That link was invalid, already used, or expired. Request another.
      </p>

      <form @submit.prevent="requestLink">
        <label for="email">Email address</label>
        <input
          id="email"
          v-model="email"
          type="email"
          required
          autocomplete="email"
        >
        <button
          type="submit"
          :disabled="requestState === 'sending'"
        >
          {{ requestState === 'sending' ? 'Sending…' : 'Send me a link' }}
        </button>
      </form>

      <p v-if="requestState === 'sent'">
        Sent. Open <a
          href="http://localhost:8025"
          target="_blank"
          rel="noreferrer"
        >Mailpit</a> and click the link.
      </p>
      <p v-else-if="requestState === 'failed'">
        Send failed — check the dev server log.
      </p>
    </template>
  </main>
</template>
