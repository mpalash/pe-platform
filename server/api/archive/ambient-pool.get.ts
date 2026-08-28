/**
 * The pool of clips the floating ambient player draws from.
 *
 * Built by `pnpm archive:pool` and read out of server storage, for the same
 * reason as the source index: no page outside /archive should be loading the
 * 18MB dataset, and this one is on nearly every page.
 *
 * PUBLIC — hard rule 4.
 */
export interface AmbientClip {
  id: string
  filename: string
  name: string
  bin: string | null
}

export default defineCachedEventHandler(async (): Promise<AmbientClip[]> => {
  const pool = await useStorage('assets:server').getItem<AmbientClip[]>('ambient-pool.json')

  if (!pool) {
    throw createError({
      statusCode: 500,
      statusMessage: 'server/assets/ambient-pool.json is missing. Run `pnpm archive:pool`.',
    })
  }

  return pool
}, {
  /*
   * Never cached in development.
   *
   * `defineCachedEventHandler` persists to `.nuxt/cache/nitro/handlers/` ON
   * DISK, and that survives a dev-server restart. Since this route serves a
   * BUILD ARTEFACT, rebuilding the artefact leaves the cache holding the old
   * one — for an hour of wall-clock time that no restart resets. The symptom is
   * a regenerated file that the site refuses to reflect, which reads as the
   * build script not having worked.
   *
   * Same reasoning as the `/**` routeRule in nuxt.config.ts: the window is
   * correct in production and actively misleading locally.
   */
  shouldBypassCache: () => import.meta.dev,
  maxAge: 60 * 60,
  name: 'archive-ambient-pool',
  getKey: () => 'ambient-pool',
})
