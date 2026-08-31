<script setup lang="ts">
/**
 * Sign in / create account, on the page.
 *
 * There is one flow behind two doors. Under magic-link (ADR-002) signing in and
 * registering are the same request — an address we know gets a link, an address
 * we do not know gets a record and then a link. The two entry points exist
 * because people look for them, not because the server does anything different.
 *
 * There is deliberately no password field and no "sign in with Google". pe-vue
 * had both; ADR-002 rules out passwords entirely and rejects social identity
 * providers as an external dependency and an access barrier for anyone without
 * such an account.
 */
const authModal = useAuthModal()
const auth = useAuth()

const email = ref('')
const name = ref('')
const state = ref<'idle' | 'sending' | 'sent' | 'failed'>('idle')
const errorMessage = ref('')

const isRegister = computed(() => authModal.mode.value === 'register')

const dialog = useTemplateRef<HTMLElement>('dialog')
const nameField = useTemplateRef<HTMLInputElement>('nameField')
const emailField = useTemplateRef<HTMLInputElement>('emailField')

/** Register starts on the name; sign-in starts on the address. */
function focusFirstField(): void {
  ;(nameField.value ?? emailField.value)?.focus()
}

async function submit(): Promise<void> {
  if (state.value === 'sending') return

  state.value = 'sending'
  errorMessage.value = ''

  try {
    await auth.requestLink(email.value, isRegister.value ? name.value : undefined)
    state.value = 'sent'
  }
  catch (cause) {
    state.value = 'failed'
    const status = (cause as { statusCode?: number })?.statusCode
    const message = (cause as { statusMessage?: string })?.statusMessage

    // 429 and 400 both carry a message worth showing verbatim; anything else
    // is ours to apologise for rather than explain.
    errorMessage.value = status === 429 || status === 400
      ? (message ?? 'That did not work.')
      : 'Could not send the link. Please try again.'
  }
}

function switchMode(): void {
  authModal.mode.value = isRegister.value ? 'signin' : 'register'
  state.value = 'idle'
  errorMessage.value = ''
  nextTick(focusFirstField)
}

/* ── dialog mechanics ──────────────────────────────────────────────────── */

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled])'

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    authModal.close()
    return
  }

  if (event.key !== 'Tab' || !dialog.value) return

  const focusable = [...dialog.value.querySelectorAll<HTMLElement>(FOCUSABLE)]
    .filter(el => el.offsetParent !== null)

  if (focusable.length === 0) return

  const first = focusable[0]!
  const last = focusable.at(-1)!

  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  }
  else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}

let previouslyFocused: HTMLElement | null = null

onMounted(() => {
  previouslyFocused = document.activeElement as HTMLElement | null
  document.body.style.overflow = 'hidden'
  nextTick(focusFirstField)
})

onBeforeUnmount(() => {
  document.body.style.overflow = ''
  previouslyFocused?.focus?.()
})
</script>

<template>
  <div
    ref="dialog"
    class="auth"
    role="dialog"
    aria-modal="true"
    :aria-labelledby="'auth-title'"
    @keydown="onKeydown"
  >
    <div
      class="auth__scrim scrim"
      @click="authModal.close()"
    />

    <div class="auth__panel frosted">
      <button
        type="button"
        class="auth__close"
        aria-label="Close"
        @click="authModal.close()"
      >
        <svg
          viewBox="0 0 16 16"
          width="14"
          height="14"
          aria-hidden="true"
        >
          <path
            d="M4 4l8 8M12 4l-8 8"
            stroke="currentColor"
            stroke-width="1.5"
            fill="none"
            stroke-linecap="round"
          />
        </svg>
      </button>

      <!-- Sent: the flow ends here and continues in their inbox. -->
      <Stack
        v-if="state === 'sent'"
        space="m"
      >
        <h2
          id="auth-title"
          class="auth__title"
        >
          Check your email
        </h2>
        <p class="auth__body">
          If <strong>{{ email }}</strong> can receive mail, a sign-in link is on its way.
          It works once and expires in 15 minutes.
        </p>
        <p class="auth__hint">
          Developing locally? The link lands in
          <a
            href="http://localhost:8025"
            target="_blank"
            rel="noreferrer"
          >Mailpit</a>.
        </p>
        <Cluster space="s">
          <button
            type="button"
            class="auth__secondary"
            @click="state = 'idle'"
          >
            Use a different address
          </button>
          <button
            type="button"
            class="auth__secondary"
            @click="authModal.close()"
          >
            Done
          </button>
        </Cluster>
      </Stack>

      <Stack
        v-else
        space="m"
      >
        <Stack space="2xs">
          <h2
            id="auth-title"
            class="auth__title"
          >
            {{ isRegister ? 'Create an account' : 'Sign in' }}
          </h2>
          <p class="auth__body">
            <template v-if="isRegister">
              We will email you a link. There is no password to choose or forget.
            </template>
            <template v-else>
              We will email you a link. No password required.
            </template>
          </p>
        </Stack>

        <form
          class="auth__form"
          @submit.prevent="submit"
        >
          <template v-if="isRegister">
            <label
              class="auth__label"
              for="auth-name"
            >Name <span class="auth__optional">optional</span></label>
            <input
              id="auth-name"
              ref="nameField"
              v-model="name"
              type="text"
              class="auth__input"
              autocomplete="name"
            >
          </template>

          <label
            class="auth__label"
            for="auth-email"
          >Email address</label>
          <input
            id="auth-email"
            ref="emailField"
            v-model="email"
            type="email"
            class="auth__input"
            autocomplete="email"
            required
            :aria-describedby="errorMessage ? 'auth-error' : undefined"
            :aria-invalid="state === 'failed' || undefined"
          >

          <p
            v-if="errorMessage"
            id="auth-error"
            class="auth__error"
            role="alert"
          >
            {{ errorMessage }}
          </p>

          <button
            type="submit"
            class="auth__submit"
            :disabled="state === 'sending'"
          >
            {{ state === 'sending' ? 'Sending…' : 'Email me a link' }}
          </button>
        </form>

        <p class="auth__switch">
          <template v-if="isRegister">
            Already have an account?
          </template>
          <template v-else>
            No account yet?
          </template>
          <button
            type="button"
            class="auth__link"
            @click="switchMode"
          >
            {{ isRegister ? 'Sign in' : 'Create one' }}
          </button>
        </p>

        <p class="auth__note">
          The archive is public and always will be — an account only saves clips and
          books a place at an event.
        </p>
      </Stack>
    </div>
  </div>
</template>

<style scoped>
.auth {
  position: fixed;
  inset: 0;
  z-index: 120;
  display: grid;
  place-items: center;
  padding: var(--space-m);
}

/* Entirely `.scrim` in primitives.css — positioning, opacity, blur and the
   no-backdrop-filter fallback. Nothing about this modal's backdrop differs from
   the others, so it overrides none of it. */

.auth__panel {
  /* Level 4, the top of the scale, and the largest gap in it: a dialog reads
     as being in front of the whole page rather than one step above it. Glass
     and border come from `.frosted` in primitives.css. */
  --elevation: var(--shadow-4);
  --frost-base: var(--surface-raised);

  position: relative;
  inline-size: min(26rem, 100%);
  padding: var(--space-xl);
}

.auth__close {
  position: absolute;
  inset-block-start: var(--space-s);
  inset-inline-end: var(--space-s);
  padding: var(--space-2xs);
  color: var(--ink-faint);
}

.auth__close:hover { color: var(--ink); }

.auth__title {
  font-size: var(--text-lg);
}

.auth__body {
  font-size: var(--text-sm);
  color: var(--ink-muted);
}

.auth__form {
  display: flex;
  flex-direction: column;
  gap: var(--space-2xs);
}

.auth__label {
  font-size: var(--text-2xs);
  letter-spacing: var(--tracking-wide);
  text-transform: uppercase;
  color: var(--ink-muted);
}

.auth__optional {
  color: var(--ink-faint);
  text-transform: none;
  letter-spacing: 0;
}

.auth__input {
  background: var(--surface);
  border: 1px solid var(--rule-strong);
  padding: var(--space-xs) var(--space-s);
  font-size: var(--text-sm);
  color: var(--ink);
  margin-block-end: var(--space-xs);
}

.auth__error {
  font-size: var(--text-xs);
  color: var(--accent);
  margin-block-end: var(--space-2xs);
}

.auth__submit {
  background: var(--accent);
  color: var(--ink-inverse);
  padding: var(--space-xs) var(--space-l);
  font-weight: var(--weight-medium);
  font-size: var(--text-sm);
}

.auth__submit:disabled {
  opacity: 0.6;
  cursor: default;
}

.auth__secondary {
  border: 1px solid var(--rule-strong);
  padding: var(--space-2xs) var(--space-s);
  font-size: var(--text-sm);
  color: var(--ink-muted);
}

.auth__secondary:hover { color: var(--ink); }

.auth__switch {
  font-size: var(--text-sm);
  color: var(--ink-muted);
}

.auth__link {
  color: var(--accent);
  text-decoration: underline;
  text-underline-offset: 0.2em;
  font-size: inherit;
}

.auth__note,
.auth__hint {
  font-size: var(--text-xs);
  color: var(--ink-faint);
}
</style>
