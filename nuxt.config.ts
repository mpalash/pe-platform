// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({

  modules: ['@nuxt/eslint'],

  components: [
    // Layout primitives are used constantly; `<Stack>` reads better than
    // `<UiStack>` at every call site.
    { path: '~/components/ui', pathPrefix: false },
    /*
     * Block components need BOTH of these flags.
     *
     * `pathPrefix: false` — BlockRenderer resolves `block_richtext` to
     *   `BlockRichtext`; with directory prefixing they register as
     *   `BlocksBlockRichtext` and nothing matches.
     *
     * `global: true` — Nuxt normally resolves `resolveComponent('Foo')` at BUILD
     *   time by reading the literal string. BlockRenderer passes a variable, which
     *   cannot be analysed statically, so the components are never included in the
     *   bundle and resolution fails at runtime. Registering them globally is what
     *   makes a dynamic block renderer possible at all.
     *
     * Failure mode for either: the page renders completely empty, with the block
     * content sitting invisibly in HTML attributes of an unknown element.
     */
    { path: '~/components/blocks', pathPrefix: false, global: true },
    '~/components',
  ],
  devtools: { enabled: true },

  /*
   * Crossfade between pages.
   *
   * `out-in` rather than a true simultaneous crossfade: overlapping two pages
   * means both are in the document at once, which doubles the height and makes
   * the scroll position jump. Fading out then in is what actually reads as a
   * crossfade without moving anything.
   *
   * Honouring prefers-reduced-motion is handled in CSS — see base.css — since
   * the durations come from the motion tokens, which collapse to 1ms.
   */
  app: {
    pageTransition: { name: 'page', mode: 'out-in' },
    layoutTransition: { name: 'page', mode: 'out-in' },
  },

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

    // Guards the draft-preview route. Server-only: a preview URL that leaks
    // this lets anyone read unpublished content.
    previewToken: 'local-development-preview-token', // NUXT_PREVIEW_TOKEN

    /*
     * Search-engine visibility for the whole deployment. True on staging
     * (`next.purgatoryedit.com`), unset in production. server/middleware/
     * noindex.ts is the only reader; see it for why this is a deployment
     * property rather than a route rule.
     */
    noindex: false, // NUXT_NOINDEX

    sessionCookieName: 'pe_session', // NUXT_SESSION_COOKIE_NAME
    // Secure cookies do not set over plain HTTP, so localhost needs this false.
    // Deployed environments set NUXT_SESSION_COOKIE_SECURE=true. (Phase 1 §1.5)
    sessionCookieSecure: false, // NUXT_SESSION_COOKIE_SECURE
    // How long someone stays signed in. Open question Q6; 30 days is a placeholder.
    sessionTtlDays: 30, // NUXT_SESSION_TTL_DAYS

    public: {
      siteUrl: 'http://localhost:3000', // NUXT_PUBLIC_SITE_URL
      // The browser needs this to build /assets/<id> image URLs. It is a public
      // URL, not a credential — the service token stays server-side above.
      directusUrl: 'http://localhost:8055', // NUXT_PUBLIC_DIRECTUS_URL

      /*
       * Archive media. See app/composables/usePlaybackSource.ts — that is the
       * only file allowed to turn these into a URL.
       *
       * mediaBase is the CloudFront distribution and is what production uses.
       * mediaOrigin is the raw S3 bucket carried over from pe-vue; it is used
       * ONLY when mediaAllowOriginFallback is explicitly true, because S3 egress
       * is billed per view (hard rule 3).
       */
      mediaBase: '', // NUXT_PUBLIC_MEDIA_BASE — CloudFront, once it exists
      mediaOrigin: '', // NUXT_PUBLIC_MEDIA_ORIGIN — S3 bucket, dev only
      mediaAllowOriginFallback: false, // NUXT_PUBLIC_MEDIA_ALLOW_ORIGIN_FALLBACK

      /*
       * Analytics (ADR-006). Self-hosted Umami — see app/composables/
       * useAnalytics.ts, which is the only file allowed to talk to the tracker.
       *
       * Both are public by nature: the website id is embedded in the tracker
       * script tag that every visitor downloads, so it identifies a site rather
       * than authorising anything. There is no Umami credential in the app at
       * all — reading the dashboard is a separate login.
       *
       * Empty is the committed default and means NO tracker is loaded. A fresh
       * clone runs with no analytics and needs no setup (hard rule 2).
       */
      umamiHost: '', // NUXT_PUBLIC_UMAMI_HOST
      umamiWebsiteId: '', // NUXT_PUBLIC_UMAMI_WEBSITE_ID
    },
  },

  /*
   * Rendering strategy (Phase 4 §4.5).
   *
   * Content pages are cached-and-revalidated rather than prerendered. Prerender
   * would need a live Directus during `pnpm build`, which CI does not have and
   * should not need — a build that depends on a running backend is a build that
   * fails for reasons unrelated to the code.
   *
   * That also answers "how does a publish trigger a rebuild": it does not. The
   * page revalidates within the window below. A Directus Flow calling a cache
   * invalidation endpoint can make it immediate, but that needs a deploy target
   * to point at — Phase 7. Editors are told the window; nobody is left
   * publishing and wondering why nothing changed.
   */
  routeRules: {
    // Draft content must never be cached or indexed.
    // No `robots` key here — that belongs to a module we have not installed and
    // do not need. An X-Robots-Tag header does the same job, and the preview page
    // also sets noindex in its own head.
    '/preview': { cache: false, headers: { 'x-robots-tag': 'noindex, nofollow' } },
    // The API is the cache boundary's inside; caching here too would double the
    // staleness window for no gain.
    '/api/**': { cache: false },
    /*
     * Not cached in development. The window is correct for production but
     * actively misleading locally: you change content, reload, and see the old
     * page for ten minutes with nothing to indicate why.
     */
    '/**': process.env.NODE_ENV === 'production' ? { swr: 600 } : { cache: false },
  },

  future: {
    compatibilityVersion: 4,
  },
  compatibilityDate: '2026-08-25',

  nitro: {
    /*
     * Filesystem store for the magic-link RATE-LIMIT counters, and nothing else
     * (server/api/auth/request.post.ts). Login tokens and sessions used to live
     * here too; they are Directus collections now (`auth_login_tokens`,
     * `auth_sessions` — see server/utils/auth-store.ts), which is what lets a
     * session survive a deploy.
     *
     * The counters are fine on an ephemeral disk. On Railway the container's
     * filesystem is wiped on every deploy, so the limits reset then — at worst
     * one extra burst of links right after a release. They are also
     * per-instance, which matters only if the service is ever scaled past one.
     * `.data/` is gitignored.
     */
    storage: {
      auth: { driver: 'fs', base: '.data/auth' },
    },
    devStorage: {
      auth: { driver: 'fs', base: '.data/auth' },
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
