/**
 * Every published page with its resolved path. Drives navigation and the
 * prerender route list.
 */
export default defineEventHandler(async () => {
  const pages = await listPages(false)
  return pages.map(({ id, title, path, parent, sort }) => ({ id, title, path, parent, sort }))
})
