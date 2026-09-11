/**
 * hls.js publishes its `light` build (`hls.js/light`) without a declaration
 * file of its own. It is the same class with optional features compiled out —
 * subtitles, alternate audio, DRM — so the main package's types describe it
 * exactly. Used only by usePlaybackSource.
 */
declare module 'hls.js/light' {
  import Hls from 'hls.js'

  export default Hls
}
