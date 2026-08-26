/**
 * Session state for the browser.
 *
 * Identity is always read from the server (`/api/auth/session`), which reads it
 * from the session cookie. Nothing here trusts a value the client could set —
 * hard rule 6, and the reason the cookie carries an opaque id rather than any
 * claim about who you are.
 */
export interface SessionUser {
  email: string
  userId: string
  name?: string | null
}

export function useAuth() {
  const user = useState<SessionUser | null>('auth:user', () => null)
  const pending = useState<boolean>('auth:pending', () => false)

  const signedIn = computed(() => user.value !== null)

  async function refresh(): Promise<void> {
    pending.value = true
    try {
      const session = await $fetch<
        { signedIn: false } | { signedIn: true, email: string, userId: string, name?: string | null }
      >('/api/auth/session')

      user.value = session.signedIn
        ? { email: session.email, userId: session.userId, name: session.name ?? null }
        : null
    }
    catch {
      user.value = null
    }
    finally {
      pending.value = false
    }
  }

  async function signOut(): Promise<void> {
    await $fetch('/api/auth/sign-out', { method: 'POST' })
    user.value = null
  }

  /** Requests a link. Resolves on send; the user finishes in their inbox. */
  async function requestLink(email: string, name?: string): Promise<void> {
    await $fetch('/api/auth/request', {
      method: 'POST',
      body: { email, ...(name ? { name } : {}) },
    })
  }

  return { user, pending, signedIn, refresh, signOut, requestLink }
}

/** Open/close state for the auth modal, so any component can summon it. */
export function useAuthModal() {
  const mode = useState<'signin' | 'register' | null>('auth:modal', () => null)

  return {
    mode,
    isOpen: computed(() => mode.value !== null),
    openSignIn: () => { mode.value = 'signin' },
    openRegister: () => { mode.value = 'register' },
    close: () => { mode.value = null },
  }
}
