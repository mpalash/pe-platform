// @ts-check
import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt({
  rules: {
    'vue/multi-word-component-names': 'off',
  },
  ignores: ['directus/migrations/**', '.data/**'],
}).override('nuxt/vue/rules', {
  files: ['app/components/blocks/**/*.vue'],
  rules: {
    /*
     * Block props are named after their Directus columns — `video_url`, not
     * `videoUrl` — so that `v-bind="block.item"` maps straight through. Renaming
     * them would mean a translation layer in every block for no gain.
     */
    'vue/prop-name-casing': 'off',
  },
})

/*
 * `vue/no-v-html` is deliberately left ON, as a warning, in the blocks that
 * render editor HTML. The risk is real — it is mitigated by Directus being the
 * only source and editors being trusted accounts, not by the markup being safe.
 * A visible warning is the honest representation of that trade-off.
 */
