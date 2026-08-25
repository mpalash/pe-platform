<script setup lang="ts">
/**
 * Resolves each M2A block to a component by name.
 *
 * `block_richtext` → `BlockRichtext`. Mechanical, so adding a block type means
 * adding a collection and a component — never editing a map that someone will
 * forget to update. (Phase 4 §4.4.)
 *
 * Note the components config in nuxt.config.ts: `~/components/blocks` is
 * registered with `pathPrefix: false`, or these names do not match.
 */
import type { PageBlock } from '~~/server/utils/pages'

defineProps<{ blocks: PageBlock[] }>()

/**
 * `block_richtext` → `BlockRichtext`.
 *
 * Note the first `toUpperCase`. The obvious version — replacing `^block_` with
 * `Block` and then camel-casing remaining underscores — yields `Blockrichtext`
 * for any single-word block, because there is no underscore left to trigger the
 * capitalisation. Every block silently renders as an unknown element, which in
 * SSR output looks like `<blockrichtext body="...">` — the content is present in
 * the HTML, as attributes, and invisible on the page. (The snippet in
 * docs/plan/04-phase-4-content-model.md §4.4 has this bug; it is corrected here.)
 */
function nameFor(collection: string): string {
  const stem = collection.replace(/^block_/, '')

  const pascal = stem
    .replace(/_(\w)/g, (_, char: string) => char.toUpperCase())
    .replace(/^(\w)/, (_, char: string) => char.toUpperCase())

  return `Block${pascal}`
}

/**
 * `resolveComponent` returns the name as a plain string when nothing matches,
 * which Vue then renders as an unknown element — that is, as nothing at all.
 * A block type without a component is a bug worth seeing, so say so.
 */
function componentFor(collection: string) {
  const name = nameFor(collection)
  const resolved = resolveComponent(name)

  if (typeof resolved === 'string') {
    console.error(`[BlockRenderer] no component for "${collection}" — expected <${name}>`)
    return 'BlockMissing'
  }

  return resolved
}
</script>

<template>
  <Stack
    space="section"
    as="div"
  >
    <component
      :is="componentFor(block.collection)"
      v-for="block in blocks"
      :key="block.id"
      :collection="block.collection"
      v-bind="block.item ?? {}"
    />
  </Stack>
</template>
