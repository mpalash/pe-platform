// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({

  modules: ['@nuxt/eslint'],

  components: [
    // Layout primitives are used constantly; `<Stack>` reads better than
    // `<UiStack>` at every call site.
    { path: '~/components/ui', pathPrefix: false },
    '~/components',
  ],
  devtools: { enabled: true },

  css: ['~/assets/styles/main.css'],

  /**
   * runtimeConfig top level is SERVER-ONLY. Anything the browser may read has to
   * sit under `public`. The Directus service token is deliberately not public —
   * hard rule: it must never reach the client bundle. (Phase 1 §1.4)
   *
   * Keys are flat rather than grouped so each one maps to exactly one NUXT_*
   * variable with no guessing. Every override in .env.example is exercised by
   * test/runtime-config.spec.ts — a variable that silently fails to apply is a
   * bad afternoon at deploy time.
   */
  runtimeConfig: {
    directusUrl: '', // NUXT_DIRECTUS_URL
    directusServiceToken: '', // NUXT_DIRECTUS_SERVICE_TOKEN

    smtpHost: '', // NUXT_SMTP_HOST
    smtpPort: 1025, // NUXT_SMTP_PORT
    smtpFrom: '', // NUXT_SMTP_FROM

    sessionCookieName: 'pe_session', // NUXT_SESSION_COOKIE_NAME
    // Secure cookies do not set over plain HTTP, so localhost needs this false.
    // Deployed environments set NUXT_SESSION_COOKIE_SECURE=true. (Phase 1 §1.5)
    sessionCookieSecure: false, // NUXT_SESSION_COOKIE_SECURE
    // How long someone stays signed in. Open question Q6; 30 days is a placeholder.
    sessionTtlDays: 30, // NUXT_SESSION_TTL_DAYS

    public: {
      siteUrl: 'http://localhost:3000', // NUXT_PUBLIC_SITE_URL
    },
  },

  future: {
    compatibilityVersion: 4,
  },
  compatibilityDate: '2026-08-25',

  nitro: {
    // ⚠️ SPIKE ONLY (Phase 1 §1.5). Filesystem-backed key-value store for the
    // throwaway magic-link tokens and sessions. `.data/` is gitignored.
    // Phase 5 decides where the real ones live; delete this mount with the spike.
    storage: {
      spike: { driver: 'fs', base: '.data/spike' },
    },
    devStorage: {
      spike: { driver: 'fs', base: '.data/spike' },
    },
  },

  // Strict from day one, while there is nothing to fix. (Phase 1 §1.1)
  typescript: {
    strict: true,
    typeCheck: false, // `pnpm typecheck` runs vue-tsc; keep dev server fast
    tsConfig: {
      compilerOptions: {
        noUncheckedIndexedAccess: true,
        noImplicitOverride: true,
        exactOptionalPropertyTypes: true,
      },
    },
  },

  eslint: {
    config: {
      stylistic: true,
    },
  },
})
