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
  maxAge: 60 * 60,
  name: 'archive-ambient-pool',
  getKey: () => 'ambient-pool',
})
