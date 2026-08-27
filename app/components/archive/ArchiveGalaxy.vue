<script setup lang="ts">
import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  Euler,
  FogExp2,
  InstancedBufferAttribute,
  InstancedMesh,
  LinearFilter,
  NoColorSpace,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  Vector3,
  WebGLRenderer,
} from 'three'

/**
 * The archive as a spiral galaxy. Ported from pe-vue's ArchiveGalaxyView.
 *
 * Every clip is one instanced billboard on a spiral arm, coloured by its
 * intensity bin. Positions are computed **on the GPU** from a per-instance
 * orbit (angle, radius) plus jitter and a float phase — 30,000 tiles cannot be
 * repositioned from JavaScript every frame, so the vertex shader does it. That
 * is also why picking is hand-rolled below: three's raycaster cannot see
 * positions it never computed.
 *
 * Thumbnails stream into a shared texture atlas with a small pool of slots,
 * assigned to whatever is nearest the camera and released when it drifts away.
 * A 30,000-texture scene is not possible; a 64-cell atlas is.
 *
 * Ported faithfully: the spiral layout constants, the GPU orbit maths, the
 * intro expansion, differential rotation, the additive halo pass, the atlas,
 * and the depth/fog controls.
 *
 * NOT ported: the depth-of-field post-processing pass. It is a render target,
 * a depth texture and a second full-screen shader for a blur that reads as
 * atmosphere; the fog carries most of that, and it is the piece most likely to
 * misbehave across GPUs. Worth adding back deliberately rather than by default.
 */

const emit = defineEmits<{ pick: [string] }>()

const archive = useArchive()

const canvasWrap = useTemplateRef<HTMLElement>('canvasWrap')

/* ── layout constants, ported ──────────────────────────────────────────── */

const GALAXY = {
  radius: 150,
  branches: 5,
  spin: 1.1,
  randomness: 0.55,
  randomnessPower: 2.6,
  discThickness: 0.35,
  tileScale: 0.55,
  densityPower: 1.8,
  innerRadius: 0.12,
  bigBangDuration: 6.0,
  expandFrom: 0.35,
  spinSpeed: 0.005,
  diffFloor: 0.15,
  clockwise: true,
  floatAmp: 1.4,
  floatFreq: 0.1,
}

const SCENE_CFG = {
  /*
   * True black, not --surface-sunken.
   *
   * The galaxy is additively blended points against a void; any lift in the
   * background greys the fog and flattens the depth the whole thing depends on.
   * This is the one place the design tokens are deliberately not used.
   */
  background: '#000000',
  fogDensity: 0.0035,
  minDistance: 12,
  maxDistance: 380,
}

const GLOW = { haloScale: 3.4, haloOpacity: 0.35, rectEmissiveBoost: 1.15 }

/**
 * Bin colours run cool (peace) to warm (war). Read from the design tokens
 * where they exist so the galaxy cannot drift from the rest of the site.
 */
const BIN_FALLBACK: Record<string, string> = {
  'Peace-05': '#6fb7c9', 'Peace-04': '#7cc0bd', 'Peace-03': '#8bc9ab',
  'Peace-02': '#9ccf96', 'Peace-01': '#b3d489',
  'War-01': '#d8cf7e', 'War-02': '#e3b778', 'War-03': '#e0a06a',
  'War-04': '#db885f', 'War-05': '#d47156', 'War-06': '#cb5b4f',
  'War-07': '#bf474b', 'War-08': '#b03647', 'War-09': '#9c2842', 'War-10': '#851d3c',
}
const UNBINNED_COLOR = '#3d3d43'

/* ── atlas ─────────────────────────────────────────────────────────────── */

const ATLAS_COLS = 8
const ATLAS_SLOTS = ATLAS_COLS * ATLAS_COLS
const ATLAS_CELL_PX = 128

/* ── controls, exposed to the UI ───────────────────────────────────────── */

const paused = ref(false)
const depthRange = ref(35)
const fogStrength = ref(1.10)
const thumbnails = ref(true)
const hovered = ref<string | null>(null)
const ready = ref(false)

/* ── shaders, ported ───────────────────────────────────────────────────── */

const COMMON_VERTEX = /* glsl */`
  attribute vec2 aOrbit;
  attribute vec3 aJitter;
  attribute vec3 aPhase;
  attribute vec3 aColor;

  uniform float uTime;
  uniform float uSpinPhase;
  uniform float uDiffFloor;
  uniform float uRadius;
  uniform float uBigBangDuration;
  uniform float uExpandFrom;
  uniform float uDirection;
  uniform float uFloatAmp;
  uniform float uFloatFreq;

  varying vec3 vColor;
  varying vec2 vUv;

  float easeOutCubic(float x){
    float m = 1.0 - x;
    return 1.0 - m*m*m;
  }

  vec3 galaxyPosition(){
    float baseAngle = aOrbit.x;
    float r = aOrbit.y;

    float tGrow = clamp(uTime / uBigBangDuration, 0.0, 1.0);
    float e = easeOutCubic(tGrow);

    // Differential rotation: inner orbits sweep faster than outer ones, which
    // is what makes the arms wind rather than turn as a rigid disc.
    float angle =
      baseAngle + uDirection * uSpinPhase / (uDiffFloor + (r / max(uRadius, 0.001)));
    float curR = r * mix(uExpandFrom, 1.0, e);

    float floatX = sin(uTime * 0.6 * uFloatFreq + aPhase.x) * uFloatAmp;
    float floatY = sin(uTime * 0.5 * uFloatFreq + aPhase.y) * uFloatAmp * 0.6;
    float floatZ = sin(uTime * 0.7 * uFloatFreq + aPhase.z) * uFloatAmp;

    return vec3(
      cos(angle) * curR + aJitter.x * e + floatX,
      aJitter.y * e + floatY,
      sin(angle) * curR + aJitter.z * e + floatZ
    );
  }
`

const RECT_VERTEX = /* glsl */`
  ${COMMON_VERTEX}
  attribute vec2 aAtlas;
  attribute float aThumbTime;
  uniform float uThumbDist;
  uniform vec2 uAtlasCell;
  uniform float uNearScale;
  varying vec2 vAtlasUv;
  varying float vThumb;
  varying float vDist;

  void main(){
    vColor = aColor;
    vUv = uv;
    vec3 orbitPos = galaxyPosition();
    vec4 viewOrbit = modelViewMatrix * vec4(orbitPos, 1.0);
    float dist = length(viewOrbit.xyz);
    vDist = dist;

    float near = 1.0 - smoothstep(uThumbDist * 0.7, uThumbDist, dist);

    // Far away the tiles tumble freely; near the camera they turn to face it
    // and scale up, so a clip you approach becomes legible.
    vec4 rotated = instanceMatrix * vec4(position, 1.0);
    vec4 viewTumble = modelViewMatrix * vec4(rotated.xyz + orbitPos, 1.0);
    float s = length(vec3(instanceMatrix[0]));
    vec4 viewBillboard = viewOrbit + vec4(position.xy * s * uNearScale, 0.0, 0.0);
    vec4 mvPosition = mix(viewTumble, viewBillboard, near);

    vAtlasUv = aAtlas + uv * uAtlasCell;
    float fade = aThumbTime < 0.0
      ? 0.0
      : clamp((uTime - aThumbTime) / 1.2, 0.0, 1.0);
    vThumb = fade * near;

    gl_Position = projectionMatrix * mvPosition;
  }
`

const RECT_FRAGMENT = /* glsl */`
  precision highp float;
  uniform sampler2D uAtlas;
  uniform float uFogDensity;
  uniform vec3 uFogColor;
  uniform float uUseThumbs;
  varying vec3 vColor;
  varying vec2 vUv;
  varying vec2 vAtlasUv;
  varying float vThumb;
  varying float vDist;

  void main(){
    vec3 base = vColor;
    float thumb = vThumb * uUseThumbs;

    if (thumb > 0.001) {
      vec3 tex = texture2D(uAtlas, vAtlasUv).rgb;
      // Tint the thumbnail toward its bin colour so the galaxy still reads as
      // an intensity map when the images arrive.
      base = mix(base, mix(tex, tex * vColor * 1.6, 0.45), thumb);
    }

    float fog = 1.0 - exp(-uFogDensity * uFogDensity * vDist * vDist);
    gl_FragColor = vec4(mix(base, uFogColor, clamp(fog, 0.0, 1.0)), 1.0);
  }
`

const HALO_VERTEX = /* glsl */`
  ${COMMON_VERTEX}
  varying float vDist;

  void main(){
    vColor = aColor;
    vUv = uv;
    vec3 orbitPos = galaxyPosition();
    vec4 rotated = instanceMatrix * vec4(position, 1.0);
    vec4 mvPosition = modelViewMatrix * vec4(rotated.xyz + orbitPos, 1.0);
    vDist = length(mvPosition.xyz);
    gl_Position = projectionMatrix * mvPosition;
  }
`

const HALO_FRAGMENT = /* glsl */`
  precision highp float;
  uniform float uOpacity;
  uniform float uFogDensity;
  varying vec3 vColor;
  varying vec2 vUv;
  varying float vDist;

  void main(){
    // Radial falloff — a soft disc, not a square.
    float d = distance(vUv, vec2(0.5)) * 2.0;
    float a = smoothstep(1.0, 0.0, d);
    float fog = 1.0 - exp(-uFogDensity * uFogDensity * vDist * vDist);
    gl_FragColor = vec4(vColor, a * a * uOpacity * (1.0 - clamp(fog, 0.0, 1.0)));
  }
`

/* ── three.js state (non-reactive on purpose) ──────────────────────────── */

let renderer: WebGLRenderer | null = null
let scene: Scene | null = null
let camera: PerspectiveCamera | null = null
let rectMesh: InstancedMesh | null = null
let haloMesh: InstancedMesh | null = null
let atlasCanvas: HTMLCanvasElement | null = null
let atlasTexture: CanvasTexture | null = null
let frame = 0
let elapsed = 0
let spinPhase = 0
let lastTime = 0

let orbitArr: Float32Array
let jitterArr: Float32Array
let phaseArr: Float32Array
let rectColorArr: Float32Array
let haloColorArr: Float32Array
let atlasArr: Float32Array
let thumbTimeArr: Float32Array

let displayedIds: string[] = []
let displayedCount = 0
let capacity = 0

const slotOfId = new Map<string, number>()
const idOfSlot = new Map<number, string>()
const freeSlots: number[] = []
const inFlight = new Set<string>()

/*
 * Starting distance sits inside the thumbnail/pick band rather than outside it.
 * At 220 with the default depth of 120, every tile is beyond the pick cutoff —
 * the galaxy renders beautifully and does not respond to a single click, which
 * reads as broken rather than as "zoom in first".
 */
const rig = { distance: 170, targetDistance: 170, theta: 0.6, phi: 1.15 }

/* ── helpers ───────────────────────────────────────────────────────────── */

function srgb(hex: string): Color {
  return new Color().setHex(Number.parseInt(hex.slice(1), 16), NoColorSpace)
}

const binColorCache = new Map<string, { rect: Color, halo: Color }>()

function colorForBin(bin: string | undefined): { rect: Color, halo: Color } {
  const hex = (bin && BIN_FALLBACK[bin]) || UNBINNED_COLOR
  let entry = binColorCache.get(hex)

  if (!entry) {
    const base = srgb(hex)
    entry = { rect: base.clone().multiplyScalar(GLOW.rectEmissiveBoost), halo: base }
    binColorCache.set(hex, entry)
  }

  return entry
}

function wrapSize(): { w: number, h: number } {
  const el = canvasWrap.value
  return {
    w: el?.clientWidth || window.innerWidth,
    h: el?.clientHeight || window.innerHeight,
  }
}

function updateCamera(): void {
  if (!camera) return
  const sp = Math.sin(rig.phi)
  const cp = Math.cos(rig.phi)
  const st = Math.sin(rig.theta)
  const ct = Math.cos(rig.theta)
  camera.position.set(rig.distance * sp * ct, rig.distance * cp, rig.distance * sp * st)
  camera.lookAt(0, 0, 0)
}

/**
 * Recomputes a tile's world position exactly as the vertex shader does.
 *
 * This duplication is unavoidable and load-bearing: the positions only exist
 * on the GPU, so picking has to reproduce the same maths on the CPU. If the
 * shader's galaxyPosition changes, this changes with it.
 */
function worldPosition(i: number, time: number, out: Vector3): Vector3 {
  const baseAngle = orbitArr[i * 2]!
  const r = orbitArr[i * 2 + 1]!

  const tGrow = Math.min(Math.max(time / GALAXY.bigBangDuration, 0), 1)
  const m = 1 - tGrow
  const e = 1 - m * m * m

  const direction = GALAXY.clockwise ? -1 : 1
  const angle = baseAngle + direction * spinPhase / (GALAXY.diffFloor + r / GALAXY.radius)
  const curR = r * (GALAXY.expandFrom + (1 - GALAXY.expandFrom) * e)

  const floatX = Math.sin(time * 0.6 * GALAXY.floatFreq + phaseArr[i * 3]!) * GALAXY.floatAmp
  const floatY = Math.sin(time * 0.5 * GALAXY.floatFreq + phaseArr[i * 3 + 1]!) * GALAXY.floatAmp * 0.6
  const floatZ = Math.sin(time * 0.7 * GALAXY.floatFreq + phaseArr[i * 3 + 2]!) * GALAXY.floatAmp

  return out.set(
    Math.cos(angle) * curR + jitterArr[i * 3]! * e + floatX,
    jitterArr[i * 3 + 1]! * e + floatY,
    Math.sin(angle) * curR + jitterArr[i * 3 + 2]! * e + floatZ,
  )
}

/* ── build ─────────────────────────────────────────────────────────────── */

function buildGalaxy(cap: number): void {
  if (!scene) return

  capacity = cap

  const baseW = 1.6
  const baseH = 0.9
  const rectGeo = new PlaneGeometry(baseW, baseH)
  const haloGeo = new PlaneGeometry(baseW * GLOW.haloScale, baseH * GLOW.haloScale)

  atlasCanvas = document.createElement('canvas')
  atlasCanvas.width = ATLAS_COLS * ATLAS_CELL_PX
  atlasCanvas.height = ATLAS_COLS * ATLAS_CELL_PX

  atlasTexture = new CanvasTexture(atlasCanvas)
  atlasTexture.minFilter = LinearFilter
  atlasTexture.magFilter = LinearFilter
  atlasTexture.generateMipmaps = false

  const shared = () => ({
    uTime: { value: 0 },
    uSpinPhase: { value: 0 },
    uDiffFloor: { value: GALAXY.diffFloor },
    uRadius: { value: GALAXY.radius },
    uBigBangDuration: { value: GALAXY.bigBangDuration },
    uExpandFrom: { value: GALAXY.expandFrom },
    uDirection: { value: GALAXY.clockwise ? -1 : 1 },
    uFloatAmp: { value: GALAXY.floatAmp },
    uFloatFreq: { value: GALAXY.floatFreq },
    uFogDensity: { value: SCENE_CFG.fogDensity * fogStrength.value },
  })

  const rectMaterial = new ShaderMaterial({
    vertexShader: RECT_VERTEX,
    fragmentShader: RECT_FRAGMENT,
    uniforms: {
      ...shared(),
      uAtlas: { value: atlasTexture },
      uAtlasCell: { value: [1 / ATLAS_COLS, 1 / ATLAS_COLS] },
      uThumbDist: { value: depthRange.value },
      uNearScale: { value: 3.2 },
      uUseThumbs: { value: 1 },
      uFogColor: { value: srgb(SCENE_CFG.background) },
    },
  })

  const haloMaterial = new ShaderMaterial({
    vertexShader: HALO_VERTEX,
    fragmentShader: HALO_FRAGMENT,
    uniforms: { ...shared(), uOpacity: { value: GLOW.haloOpacity } },
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  })

  rectMesh = new InstancedMesh(rectGeo, rectMaterial, cap)
  haloMesh = new InstancedMesh(haloGeo, haloMaterial, cap)
  rectMesh.frustumCulled = false
  haloMesh.frustumCulled = false

  orbitArr = new Float32Array(cap * 2)
  jitterArr = new Float32Array(cap * 3)
  phaseArr = new Float32Array(cap * 3)
  rectColorArr = new Float32Array(cap * 3)
  haloColorArr = new Float32Array(cap * 3)
  atlasArr = new Float32Array(cap * 2).fill(-1)
  thumbTimeArr = new Float32Array(cap).fill(-1)

  const dummy = new Object3D()
  const euler = new Euler()

  for (let i = 0; i < cap; i++) {
    // An inner hole plus a density power keeps the core sparse enough that
    // individual tiles stay pickable rather than fusing into a blob.
    const rNorm = GALAXY.innerRadius
      + (1 - GALAXY.innerRadius) * Math.random() ** GALAXY.densityPower
    const r = rNorm * GALAXY.radius

    const branchAngle = ((i % GALAXY.branches) / GALAXY.branches) * Math.PI * 2
    orbitArr[i * 2] = branchAngle + r * GALAXY.spin
    orbitArr[i * 2 + 1] = r

    const rand = () =>
      Math.random() ** GALAXY.randomnessPower
      * (Math.random() < 0.5 ? 1 : -1)
      * GALAXY.randomness
      * r

    jitterArr[i * 3] = rand()
    jitterArr[i * 3 + 1] = rand() * GALAXY.discThickness
    jitterArr[i * 3 + 2] = rand()

    phaseArr[i * 3] = Math.random() * Math.PI * 2
    phaseArr[i * 3 + 1] = Math.random() * Math.PI * 2
    phaseArr[i * 3 + 2] = Math.random() * Math.PI * 2

    // Translation is baked to zero: the shader supplies position, and the
    // instance matrix carries only rotation and scale.
    dummy.position.set(0, 0, 0)
    euler.set(Math.random() * Math.PI * 2, Math.random() * Math.PI * 2, Math.random() * Math.PI * 2)
    dummy.quaternion.setFromEuler(euler)
    const s = GALAXY.tileScale * (0.7 + Math.random() * 0.6)
    dummy.scale.set(s, s, s)
    dummy.updateMatrix()

    rectMesh.setMatrixAt(i, dummy.matrix)
    haloMesh.setMatrixAt(i, dummy.matrix)
  }

  rectMesh.instanceMatrix.needsUpdate = true
  haloMesh.instanceMatrix.needsUpdate = true

  rectGeo.setAttribute('aOrbit', new InstancedBufferAttribute(orbitArr, 2))
  rectGeo.setAttribute('aJitter', new InstancedBufferAttribute(jitterArr, 3))
  rectGeo.setAttribute('aPhase', new InstancedBufferAttribute(phaseArr, 3))
  rectGeo.setAttribute('aColor', new InstancedBufferAttribute(rectColorArr, 3))
  rectGeo.setAttribute('aAtlas', new InstancedBufferAttribute(atlasArr, 2))
  rectGeo.setAttribute('aThumbTime', new InstancedBufferAttribute(thumbTimeArr, 1))

  haloGeo.setAttribute('aOrbit', new InstancedBufferAttribute(orbitArr, 2))
  haloGeo.setAttribute('aJitter', new InstancedBufferAttribute(jitterArr, 3))
  haloGeo.setAttribute('aPhase', new InstancedBufferAttribute(phaseArr, 3))
  haloGeo.setAttribute('aColor', new InstancedBufferAttribute(haloColorArr, 3))

  scene.add(haloMesh)
  scene.add(rectMesh)

  for (let s = ATLAS_SLOTS - 1; s >= 0; s--) freeSlots.push(s)

  elapsed = 0
}

function applyPlaylist(ids: string[]): void {
  if (!rectMesh || !haloMesh) return

  displayedIds = ids
  displayedCount = Math.min(ids.length, capacity)

  for (let i = 0; i < displayedCount; i++) {
    const item = archive.getItem(ids[i]!)
    const { rect, halo } = colorForBin(item?.bin)

    rectColorArr[i * 3] = rect.r
    rectColorArr[i * 3 + 1] = rect.g
    rectColorArr[i * 3 + 2] = rect.b
    haloColorArr[i * 3] = halo.r
    haloColorArr[i * 3 + 1] = halo.g
    haloColorArr[i * 3 + 2] = halo.b
  }

  rectMesh.count = displayedCount
  haloMesh.count = displayedCount
  ;(rectMesh.geometry.getAttribute('aColor') as InstancedBufferAttribute).needsUpdate = true
  ;(haloMesh.geometry.getAttribute('aColor') as InstancedBufferAttribute).needsUpdate = true

  // Thumbnails belong to instance indices, and the indices now mean different
  // clips, so every assignment is stale.
  releaseAllSlots()
}

/* ── thumbnail atlas ───────────────────────────────────────────────────── */

function releaseAllSlots(): void {
  for (const slot of idOfSlot.keys()) freeSlots.push(slot)
  idOfSlot.clear()
  slotOfId.clear()
  atlasArr.fill(-1)
  thumbTimeArr.fill(-1)
  markAtlasDirty()
}

function markAtlasDirty(): void {
  if (!rectMesh) return
  ;(rectMesh.geometry.getAttribute('aAtlas') as InstancedBufferAttribute).needsUpdate = true
  ;(rectMesh.geometry.getAttribute('aThumbTime') as InstancedBufferAttribute).needsUpdate = true
}

/**
 * Atlas cell origin, in texture space.
 *
 * `v` is measured from the BOTTOM because three uploads a CanvasTexture with
 * flipY on. Computing the row top-down instead — the obvious way — makes every
 * tile sample a mirrored cell, which on a mostly-empty atlas means no
 * thumbnails appear at all rather than wrong ones. That is the bug this had.
 */
function slotUv(slot: number): { u: number, v: number } {
  const col = slot % ATLAS_COLS
  const row = Math.floor(slot / ATLAS_COLS)

  return {
    u: col / ATLAS_COLS,
    v: 1 - (row + 1) / ATLAS_COLS,
  }
}

function drawToAtlas(image: HTMLImageElement, slot: number): void {
  if (!atlasCanvas || !atlasTexture) return

  const ctx = atlasCanvas.getContext('2d')
  if (!ctx) return

  const col = slot % ATLAS_COLS
  const row = Math.floor(slot / ATLAS_COLS)
  const x = col * ATLAS_CELL_PX
  const y = row * ATLAS_CELL_PX

  ctx.clearRect(x, y, ATLAS_CELL_PX, ATLAS_CELL_PX)

  // Cover-fit into the square cell.
  const scale = Math.max(ATLAS_CELL_PX / image.width, ATLAS_CELL_PX / image.height)
  const w = image.width * scale
  const h = image.height * scale
  ctx.drawImage(image, x + (ATLAS_CELL_PX - w) / 2, y + (ATLAS_CELL_PX - h) / 2, w, h)

  atlasTexture.needsUpdate = true
}

function assignSlot(id: string, index: number): void {
  if (slotOfId.has(id) || inFlight.has(id)) return
  if (freeSlots.length === 0) return

  const item = archive.getItem(id)
  const poster = item ? usePlaybackSource(item.filename).poster : null
  if (!poster) return

  const slot = freeSlots.pop()!
  inFlight.add(id)

  const image = new Image()
  image.crossOrigin = 'anonymous'

  image.onload = () => {
    inFlight.delete(id)

    // The view may have moved on while this was loading.
    if (displayedIds[index] !== id) {
      freeSlots.push(slot)
      return
    }

    drawToAtlas(image, slot)
    slotOfId.set(id, slot)
    idOfSlot.set(slot, id)

    const { u, v } = slotUv(slot)
    atlasArr[index * 2] = u
    atlasArr[index * 2 + 1] = v
    thumbTimeArr[index] = elapsed
    markAtlasDirty()
  }

  image.onerror = () => {
    inFlight.delete(id)
    freeSlots.push(slot)
  }

  image.src = poster
}

const scanPos = new Vector3()

/**
 * Give the atlas slots to whatever is nearest the camera.
 *
 * Scans a slice of the instances each call rather than all 30,000 — a full
 * pass every frame would cost more than the rendering does.
 */
/**
 * Give the atlas slots to the tiles genuinely nearest the camera.
 *
 * The previous version scanned a rolling 600 of 30,000 instances per frame and
 * claimed a slot for anything within range that it happened to see. A given
 * near tile was therefore only considered once every fifty frames, and the 64
 * slots went to whichever near tiles fell inside the current window rather than
 * to the closest ones — so a handful of thumbnails appeared, in no particular
 * place, and changed arbitrarily as you moved. That is the "only a few show up"
 * behaviour.
 *
 * Now: rank every candidate by distance and hand the slots to the top 64.
 * Tiles this close are also the ones the vertex shader billboards toward the
 * camera, so "nearest" and "facing you" are the same set by construction.
 *
 * A full scan is ~30k distance computations. That is a millisecond or so, which
 * is why it runs a few times a second rather than every frame.
 */
const RESCAN_INTERVAL_MS = 250

let lastScan = 0

function updateThumbnails(now: number): void {
  if (!camera || displayedCount === 0) return

  if (!thumbnails.value) {
    if (slotOfId.size > 0) releaseAllSlots()
    return
  }

  if (now - lastScan < RESCAN_INTERVAL_MS) return
  lastScan = now

  /*
   * Rank EVERY tile by distance and take the nearest 64 — no distance cutoff.
   *
   * Filtering by `depthRange` first was wrong in a way worth recording: the
   * depth slider controls how close a tile must be to be *displayed* as a
   * thumbnail, and the shader already enforces that. Using it to decide what to
   * *load* meant that whenever nothing happened to be inside that radius —
   * during the intro expansion, or at any camera distance with the depth set
   * low, which is now the default — the atlas stayed completely empty.
   *
   * Loading the nearest tiles unconditionally also means the texture is already
   * there when one drifts into range, instead of fading in a second late.
   */
  const candidates: Array<{ id: string, index: number, distance: number }> = []

  for (let i = 0; i < displayedCount; i++) {
    const id = displayedIds[i]
    if (!id) continue

    worldPosition(i, elapsed, scanPos)
    candidates.push({ id, index: i, distance: scanPos.distanceTo(camera.position) })
  }

  candidates.sort((a, b) => a.distance - b.distance)
  const wanted = candidates.slice(0, ATLAS_SLOTS)
  const wantedIds = new Set(wanted.map(entry => entry.id))

  // Release anything that is no longer in the nearest set, freeing its slot
  // before the assignments below ask for one.
  for (const [id, slot] of [...slotOfId]) {
    if (wantedIds.has(id)) continue

    slotOfId.delete(id)
    idOfSlot.delete(slot)
    freeSlots.push(slot)

    const index = displayedIds.indexOf(id)
    if (index >= 0) {
      atlasArr[index * 2] = -1
      thumbTimeArr[index] = -1
    }
  }

  for (const entry of wanted) {
    if (slotOfId.has(entry.id)) {
      // Already has a slot, but its instance index may have moved with a
      // filter change — keep the attribute pointing at the right tile.
      const slot = slotOfId.get(entry.id)!
      const { u, v } = slotUv(slot)
      atlasArr[entry.index * 2] = u
      atlasArr[entry.index * 2 + 1] = v
      continue
    }

    assignSlot(entry.id, entry.index)
  }

  markAtlasDirty()
}

/* ── picking ───────────────────────────────────────────────────────────── */

const pickPos = new Vector3()

/**
 * Nearest instance to the cursor ray.
 *
 * three's raycaster is no use here — the instance matrices carry no
 * translation, so as far as three is concerned every tile sits at the origin.
 */
function pick(clientX: number, clientY: number): { id: string, index: number } | null {
  if (!camera || !canvasWrap.value || displayedCount === 0) return null

  /*
   * Force the camera's world matrix current before projecting.
   *
   * `Vector3.project` reads `camera.matrixWorldInverse`, which three only
   * refreshes inside `renderer.render()`. Picking between frames — or before
   * the first frame — therefore projects against a stale or identity matrix and
   * every tile lands outside the frustum, so nothing is ever pickable.
   */
  camera.updateMatrixWorld()

  const rect = canvasWrap.value.getBoundingClientRect()
  const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1
  const ndcY = -((clientY - rect.top) / rect.height) * 2 + 1

  let bestIndex = -1
  let bestScore = Infinity

  for (let i = 0; i < displayedCount; i++) {
    worldPosition(i, elapsed, pickPos)

    const distance = pickPos.distanceTo(camera.position)
    // Slightly more forgiving than the thumbnail threshold: a tile you can see
    // clearly enough to aim at should be clickable, even if it has not earned
    // an atlas slot yet.
    if (distance > depthRange.value * 1.5) continue

    pickPos.project(camera)
    if (pickPos.z < -1 || pickPos.z > 1) continue

    const dx = pickPos.x - ndcX
    const dy = pickPos.y - ndcY
    const screenDistance = Math.hypot(dx, dy)

    // Generous but not unbounded: roughly the on-screen size of a near tile.
    if (screenDistance > 0.045) continue

    // Prefer the closer of two overlapping tiles.
    const score = screenDistance + distance * 0.0004
    if (score < bestScore) {
      bestScore = score
      bestIndex = i
    }
  }

  if (bestIndex < 0) return null

  const id = displayedIds[bestIndex]
  return id ? { id, index: bestIndex } : null
}

/* ── interaction ───────────────────────────────────────────────────────── */

const dragging = ref(false)
let pointerDown = false
let downX = 0
let downY = 0
let lastX = 0
let lastY = 0
let moved = 0

function onPointerDown(event: PointerEvent): void {
  pointerDown = true
  moved = 0
  downX = lastX = event.clientX
  downY = lastY = event.clientY
  ;(event.target as Element).setPointerCapture?.(event.pointerId)
}

function onPointerMove(event: PointerEvent): void {
  if (!pointerDown) {
    const hit = pick(event.clientX, event.clientY)
    hovered.value = hit ? (archive.getItem(hit.id)?.name ?? null) : null
    return
  }

  const dx = event.clientX - lastX
  const dy = event.clientY - lastY
  lastX = event.clientX
  lastY = event.clientY
  moved += Math.abs(dx) + Math.abs(dy)

  if (moved > 4) dragging.value = true

  rig.theta -= dx * 0.005
  rig.phi = Math.min(Math.PI - 0.05, Math.max(0.05, rig.phi - dy * 0.005))
  updateCamera()
}

function onPointerUp(event: PointerEvent): void {
  pointerDown = false

  const travelled = Math.abs(event.clientX - downX) + Math.abs(event.clientY - downY)
  dragging.value = false

  // A drag that ends over a tile is not a click on it.
  if (travelled > 6) return

  const hit = pick(event.clientX, event.clientY)
  if (hit) emit('pick', hit.id)
}

function onWheel(event: WheelEvent): void {
  event.preventDefault()
  rig.targetDistance = Math.min(
    SCENE_CFG.maxDistance,
    Math.max(SCENE_CFG.minDistance, rig.targetDistance + event.deltaY * 0.12),
  )
}

/** Keyboard equivalents, so the galaxy is not mouse-only (hard rule 11). */
function onKeydown(event: KeyboardEvent): void {
  const step = 0.08
  const zoom = 12

  switch (event.key) {
    case 'ArrowLeft':
      rig.theta += step
      break
    case 'ArrowRight':
      rig.theta -= step
      break
    case 'ArrowUp':
      rig.phi = Math.max(0.05, rig.phi - step)
      break
    case 'ArrowDown':
      rig.phi = Math.min(Math.PI - 0.05, rig.phi + step)
      break
    case '+':
    case '=':
      rig.targetDistance = Math.max(SCENE_CFG.minDistance, rig.targetDistance - zoom)
      break
    case '-':
    case '_':
      rig.targetDistance = Math.min(SCENE_CFG.maxDistance, rig.targetDistance + zoom)
      break
    default:
      return
  }
  event.preventDefault()
  updateCamera()
}

/* ── loop ──────────────────────────────────────────────────────────────── */

function setUniform(name: string, value: unknown): void {
  for (const mesh of [rectMesh, haloMesh]) {
    const material = mesh?.material as ShaderMaterial | undefined
    if (material?.uniforms?.[name]) material.uniforms[name]!.value = value
  }
}

function render(time: number): void {
  frame = requestAnimationFrame(render)
  if (!renderer || !scene || !camera) return

  const delta = lastTime ? Math.min((time - lastTime) / 1000, 0.05) : 0
  lastTime = time

  if (!paused.value) {
    elapsed += delta
    spinPhase += delta * GALAXY.spinSpeed
  }

  rig.distance += (rig.targetDistance - rig.distance) * 0.08
  updateCamera()

  setUniform('uTime', elapsed)
  setUniform('uSpinPhase', spinPhase)
  setUniform('uFogDensity', SCENE_CFG.fogDensity * fogStrength.value)

  const rectMaterial = rectMesh?.material as ShaderMaterial | undefined
  if (rectMaterial?.uniforms) {
    rectMaterial.uniforms.uThumbDist!.value = depthRange.value
    rectMaterial.uniforms.uUseThumbs!.value = thumbnails.value ? 1 : 0
  }

  updateThumbnails(time)
  renderer.render(scene, camera)
}

function resize(): void {
  if (!renderer || !camera) return
  const { w, h } = wrapSize()
  camera.aspect = w / h
  camera.updateProjectionMatrix()
  renderer.setSize(w, h)
}

onMounted(() => {
  const el = canvasWrap.value
  if (!el) return

  const { w, h } = wrapSize()

  renderer = new WebGLRenderer({ antialias: false, alpha: false })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5))
  renderer.setSize(w, h)
  el.appendChild(renderer.domElement)

  scene = new Scene()
  scene.background = srgb(SCENE_CFG.background)
  scene.fog = new FogExp2(SCENE_CFG.background, SCENE_CFG.fogDensity)

  camera = new PerspectiveCamera(55, w / h, 0.1, 2000)
  updateCamera()

  // Capacity is the whole archive; count is set per filter in applyPlaylist.
  buildGalaxy(Math.min(archive.total.value || 30_000, 30_000))
  applyPlaylist(archive.displayedIds.value)

  window.addEventListener('resize', resize)
  frame = requestAnimationFrame(render)
  ready.value = true
})

onBeforeUnmount(() => {
  cancelAnimationFrame(frame)
  window.removeEventListener('resize', resize)

  // WebGL resources are not garbage collected — leaking a context per view
  // switch will exhaust the browser's context limit within a few toggles.
  rectMesh?.geometry.dispose()
  haloMesh?.geometry.dispose()
  ;(rectMesh?.material as ShaderMaterial | undefined)?.dispose()
  ;(haloMesh?.material as ShaderMaterial | undefined)?.dispose()
  atlasTexture?.dispose()
  renderer?.dispose()
  renderer?.domElement.remove()
  renderer = null
  scene = null
  camera = null
})

watch(() => archive.displayedIds.value, ids => applyPlaylist(ids))

// A new depth changes which tiles qualify; re-rank on the next frame.
watch(depthRange, () => {
  lastScan = 0
})
</script>

<template>
  <div class="galaxy">
    <div
      ref="canvasWrap"
      class="galaxy__canvas"
      :class="{ 'galaxy__canvas--dragging': dragging }"
      tabindex="0"
      role="application"
      aria-label="Archive galaxy. Drag to orbit, scroll to zoom, click a tile to open it. Arrow keys orbit; plus and minus zoom."
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointerleave="onPointerUp"
      @wheel="onWheel"
      @keydown="onKeydown"
    />

    <p
      v-if="hovered"
      class="galaxy__hover"
    >
      {{ hovered }}
    </p>

    <div class="galaxy__controls">
      <button
        type="button"
        class="galaxy__toggle"
        :aria-pressed="paused"
        @click="paused = !paused"
      >
        {{ paused ? 'Play' : 'Pause' }}
      </button>

      <button
        type="button"
        class="galaxy__toggle"
        :class="{ 'galaxy__toggle--on': thumbnails }"
        :aria-pressed="thumbnails"
        @click="thumbnails = !thumbnails"
      >
        Thumbnails
      </button>

      <label class="galaxy__slider">
        <span>Depth <em>{{ depthRange }}</em></span>
        <input
          v-model.number="depthRange"
          type="range"
          min="20"
          max="200"
          step="5"
        >
      </label>

      <label class="galaxy__slider">
        <span>Fog <em>{{ fogStrength.toFixed(2) }}</em></span>
        <input
          v-model.number="fogStrength"
          type="range"
          min="0"
          max="1.5"
          step="0.05"
        >
      </label>
    </div>

    <p class="galaxy__hint">
      Drag to orbit · scroll to zoom · click a tile to open it
    </p>
  </div>
</template>

<style scoped>
.galaxy {
  position: relative;
  /* Fills whatever the page gives it — the page decides how much space the
     galaxy gets, because only the page knows what else is on screen. */
  block-size: 100%;
  min-block-size: 24rem;
  background: #000;
  overflow: hidden;
}

.galaxy__canvas {
  position: absolute;
  inset: 0;
  cursor: grab;
}

.galaxy__canvas:focus-visible {
  outline: var(--focus-width) solid var(--focus);
  outline-offset: calc(var(--focus-offset) * -1);
}

.galaxy__canvas--dragging {
  cursor: grabbing;
}

.galaxy__canvas :deep(canvas) {
  display: block;
  inline-size: 100%;
  block-size: 100%;
}

.galaxy__hover {
  position: absolute;
  inset-block-start: var(--space-s);
  inset-inline-start: var(--space-s);
  max-inline-size: min(28rem, 60%);
  padding: var(--space-2xs) var(--space-xs);
  background: color-mix(in srgb, var(--surface) 80%, transparent);
  font-size: var(--text-2xs);
  color: var(--ink-muted);
  pointer-events: none;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.galaxy__controls {
  position: absolute;
  inset-block-end: var(--space-s);
  inset-inline-start: var(--space-s);
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-xs);
  align-items: center;
  padding: var(--space-2xs) var(--space-xs);
  background: color-mix(in srgb, var(--surface) 80%, transparent);
}

.galaxy__toggle {
  border: 1px solid var(--rule);
  padding: var(--space-3xs) var(--space-xs);
  font-size: var(--text-2xs);
  letter-spacing: var(--tracking-wide);
  text-transform: uppercase;
  color: var(--ink-faint);
}

.galaxy__toggle:hover { color: var(--ink); }

.galaxy__toggle--on {
  color: var(--accent);
  border-color: var(--accent);
}

.galaxy__slider {
  display: flex;
  gap: var(--space-2xs);
  align-items: center;
  font-size: var(--text-2xs);
  letter-spacing: var(--tracking-wide);
  text-transform: uppercase;
  color: var(--ink-faint);
}

.galaxy__slider em {
  font-style: normal;
  color: var(--ink-muted);
  font-variant-numeric: tabular-nums;
}

.galaxy__slider input {
  inline-size: 6rem;
  accent-color: var(--accent);
}

.galaxy__hint {
  position: absolute;
  inset-block-end: var(--space-s);
  inset-inline-end: var(--space-s);
  font-size: var(--text-2xs);
  color: var(--ink-faint);
  pointer-events: none;
}

@media (width < 48rem) {
  .galaxy__hint { display: none; }
}
</style>
