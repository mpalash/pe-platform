/**
 * Loads the Umami tracker, and reports the one event the server owns.
 *
 * Client-only by filename: there is nothing to do during SSR, and the tracker
 * is a browser script.
 *
 * The script is NOT loaded when the host or website id is empty, which is the
 * committed default. A fresh clone runs with no analytics at all and needs no
 * setup to work — hard rule 2 cuts both ways, and "you must configure analytics
 * before the site will run" would be the wrong kind of local dependency.
 */
export default defineNuxtPlugin(() => {
  const { umamiHost, umamiWebsiteId } = useRuntimeConfig().public

  if (umamiHost && umamiWebsiteId) {
    useHead({
      script: [{
        'src': `${umamiHost.replace(/\/$/, '')}/script.js`,
        'data-website-id': umamiWebsiteId,
        /*
         * Honour the browser's Do Not Track header. It is off by default in
         * every current browser so this costs almost nothing in practice —
         * but a site that self-hosts analytics for privacy reasons and then
         * ignores the one signal a reader can actually send would be saying
         * something it does not mean.
         */
        'data-do-not-track': 'true',
        'defer': true,
      }],
    })
  }

  /*
   * Sign-in outcome.
   *
   * The magic-link verify route is a SERVER redirect — it lands on `/?auth=…`
   * with no component involved — so the completion half of the funnel has to be
   * read off the query string here. Doing it in the plugin rather than on the
   * index page keeps it working if the redirect target ever changes.
   *
   * Hard rule 9 is the reason this matters: a silent mail failure is a user who
   * cannot sign in and cannot tell you. `signin-requested` far exceeding
   * `signin-completed` is the shape that shows it.
   */
  const route = useRoute()
  const { track } = useAnalytics()

  onNuxtReady(() => {
    if (route.query.auth === 'signed-in') track('signin-completed')
    if (route.query.auth === 'invalid-link') track('signin-failed', { reason: 'invalid-link' })
  })
})
