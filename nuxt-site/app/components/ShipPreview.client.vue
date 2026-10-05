<script setup lang="ts">
// Interactive 3D view of one fully assembled ship.
//
// How a ship goes together lives in shared/data/ship-assemblies.json and is
// built by lib/shipAssembly.ts (shared with the web game); this component
// adds the stage around it: camera, orbit controls, post-processing, sea.
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { createSea } from '~/lib/seaScene'
import { detectLevel, isCoarse } from '~/lib/deviceTier'
import { data, createAssemblyKit, makeMaterial, placeMatrix, filamentTime, setupGlow, animateGlow, type GlowState } from '~/lib/shipAssembly'

const props = defineProps<{
  /** Key into ship-assemblies.json `ships`, e.g. "queens-fleet". */
  ship: string
  /** Optional filament override for the hull (a printed-kit color variant). */
  hullColor?: string | null
  alt?: string
}>()

const container = ref<HTMLDivElement | null>(null)
const loading = ref(true)
const errored = ref(false)

let renderer: THREE.WebGLRenderer | null = null
let composer: EffectComposer | null = null
let gtao: GTAOPass | null = null
let scene: THREE.Scene | null = null
let camera: THREE.PerspectiveCamera | null = null
let controls: OrbitControls | null = null
let shipGroup: THREE.Group | null = null
let shipOnly: THREE.Group | null = null
let sea: ReturnType<typeof createSea> | null = null
// A ship's inner glow (ship-assemblies.json `glow`), animated each frame.
let glow: GlowState | null = null
let hullMaterial: THREE.MeshStandardMaterial | null = null
const kit = createAssemblyKit()
let raf = 0
let resizeObs: ResizeObserver | null = null
let io: IntersectionObserver | null = null

// ── Drawing only when it is seen ─────────────────────────────────────
// The loop runs only while the preview is on screen and the tab is
// showing. It draws at full rate (at most 60 fps, even on a 120 Hz phone)
// while someone is turning or zooming the ship, and for a moment after so
// the damping settles; the slow turntable spin and the sea look the same at
// 30 fps, for half the work.
const ACTIVE_FPS = 60
const IDLE_FPS = 30
let running = false
let onScreen = true
let dragging = false
let activeUntil = 0
let lastDraw = 0
let time = 0
let dpr = 1
// Frame times at the current rate, to fall back to cheaper drawing when the
// device cannot keep up: first without ambient occlusion, then at 1x.
const perf = { samples: [] as number[], fps: 0 }

async function build(shipKey: string) {
  if (!scene) return
  const ship = data.ships[shipKey]
  if (!ship) {
    errored.value = true
    loading.value = false
    return
  }
  loading.value = true
  errored.value = false
  try {
    // Hull space is Z up; three.js is Y up. The ship and the terrain share
    // one frame, and the camera frames the ship alone.
    const outer = new THREE.Group()
    outer.rotation.x = -Math.PI / 2
    const terrain = new THREE.Group()

    hullMaterial?.dispose()
    hullMaterial = makeMaterial(ship.hull.color, props.hullColor)
    const rig = kit.buildShip(shipKey, hullMaterial)
    const jobs: Promise<unknown>[] = [rig]
    for (const t of data.scene.terrain) {
      const part = data.parts[t.part]
      if (!part || !t.at) continue
      jobs.push(kit.mesh(part.preview, t.color, placeMatrix(t.at, t.rotZ ?? 0, part.anchor ?? [0, 0, 0]), undefined, true, part.printUp).then(m => terrain.add(m)))
    }
    await Promise.all(jobs)
    const group = (await rig).group
    outer.add(group, terrain)

    sea?.apply(data.scene.atmospheres[ship.atmosphere ?? 'fair'] ?? data.scene.atmospheres.fair!)
    for (const l of glow?.lights ?? []) l.removeFromParent()
    glow = setupGlow(ship, group)
    if (shipGroup) scene.remove(shipGroup)
    scene.add(outer)
    shipGroup = outer
    shipOnly = group
    fitCamera()
  } catch (err) {
    console.error('3D preview failed', err)
    errored.value = true
  } finally {
    loading.value = false
    wake()
  }
}

function fitCamera() {
  if (!shipOnly || !shipGroup || !camera || !controls) return
  // From the outer (rotated) group down, or the box comes out in hull space.
  shipGroup.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(shipOnly)
  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())
  const maxDim = Math.max(size.x, size.y, size.z)
  const dist = (maxDim / 2) / Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * 1.05
  // A three-quarter view off the bow, low enough that the horizon (sky,
  // distant islands) sits in the upper part of the frame.
  camera.position.set(-0.64, 0.24, 0.72).normalize().multiplyScalar(dist * 1.08).add(center)
  camera.near = dist / 50
  camera.far = 20000
  camera.updateProjectionMatrix()
  controls.target.copy(center)
  controls.minDistance = dist * 0.35
  controls.maxDistance = dist * 3
  // Stay above the water.
  controls.maxPolarAngle = THREE.MathUtils.degToRad(86)
  controls.update()
}

function setSize() {
  if (!renderer || !camera || !container.value) return
  wake()
  const w = container.value.clientWidth
  const h = container.value.clientHeight
  if (w === 0 || h === 0) return
  // updateStyle stays on: without it the canvas displays at its bitmap size,
  // grows the container and feeds the ResizeObserver forever.
  renderer.setPixelRatio(dpr)
  renderer.setSize(w, h)
  composer?.setPixelRatio(dpr)
  composer?.setSize(w, h)
  camera.aspect = w / h
  camera.updateProjectionMatrix()
}


// Start once the container exists. Inside <ClientOnly> it is not always
// attached by the time onMounted runs, so watch for it rather than bail.
async function init(el: HTMLDivElement) {
  scene = new THREE.Scene()
  camera = new THREE.PerspectiveCamera(35, 1, 0.1, 1000)
  renderer = new THREE.WebGLRenderer({ antialias: true })
  // What the device can afford (lib/deviceTier.ts): desktops keep the full
  // look (2x, ambient occlusion); phones draw at up to 1.5x, which on a
  // small, dense screen is hard to tell from 2x and a good deal less work;
  // weak devices and software rendering skip the ambient occlusion.
  const tier = detectLevel(renderer)
  const useAO = tier >= 2
  dpr = Math.min(window.devicePixelRatio || 1, tier <= 1 ? 1 : isCoarse() ? 1.5 : 2)
  renderer.setPixelRatio(dpr)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  // Neutral keeps filament colours true; ACES would grey the whites and
  // shift the golds.
  renderer.toneMapping = THREE.NeutralToneMapping
  renderer.toneMappingExposure = 1.0
  renderer.domElement.style.display = 'block'
  el.appendChild(renderer.domElement)

  // Ground-truth ambient occlusion: darkens the crevices where parts meet
  // the deck, inside the cannon slots and under the gunwales, which is most
  // of what makes a small printed model read as solid. Units are hull mm.
  // Multisampled target: the composer bypasses the canvas's own antialiasing.
  composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { samples: 4, type: THREE.HalfFloatType }))
  composer.addPass(new RenderPass(scene, camera))
  if (useAO) {
    gtao = new GTAOPass(scene, camera, el.clientWidth || 800, el.clientHeight || 600)
    gtao.updateGtaoMaterial({ radius: 4, distanceExponent: 1.4, thickness: 2, scale: 1.1, samples: 16, distanceFallOff: 1, screenSpaceRadius: false })
    gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 })
    gtao.blendIntensity = 1.0
    composer.addPass(gtao)
  }
  composer.addPass(new OutputPass())

  // Sky, sea, weather and lights, set per ship from its atmosphere.
  sea = createSea(renderer, scene, data.scene.waterLevel)

  controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.08
  controls.enablePan = false
  controls.autoRotate = true
  controls.autoRotateSpeed = 0.6
  controls.addEventListener('start', () => { dragging = true; wake() })
  controls.addEventListener('end', () => { dragging = false; wake() })

  setSize()
  resizeObs = new ResizeObserver(setSize)
  resizeObs.observe(el)
  io = new IntersectionObserver(([e]) => {
    onScreen = !!e?.isIntersecting
    if (onScreen) start()
    else stop()
  })
  io.observe(el)
  document.addEventListener('visibilitychange', onVisibility)

  start()
  await build(props.ship)
}

/** Draw at full rate for a moment (a drag, a zoom, a new ship). */
function wake(ms = 1500) {
  activeUntil = Math.max(activeUntil, performance.now() + ms)
  start()
}

function start() {
  if (running || !renderer || !onScreen || document.hidden) return
  running = true
  lastDraw = 0
  raf = requestAnimationFrame(tick)
}

function stop() {
  running = false
  cancelAnimationFrame(raf)
}

function onVisibility() {
  if (document.hidden) stop()
  else start()
}

function tick(now: number) {
  if (!running) return
  raf = requestAnimationFrame(tick)
  const fps = dragging || loading.value || now < activeUntil ? ACTIVE_FPS : IDLE_FPS
  // A few ms early is fine: rAF ticks land on the display's own beat.
  if (lastDraw && now - lastDraw < 1000 / fps - 4) return
  const dtMs = lastDraw ? now - lastDraw : 1000 / ACTIVE_FPS
  lastDraw = now
  timeFrame(dtMs, fps)
  // Time-based, so the spin and the sea run at the same speed at any rate
  // (and pick up where they left off after a pause).
  const dt = Math.min(0.1, dtMs / 1000)
  time += dt
  controls?.update(dt)
  if (sea && controls) sea.update(time, controls.target)
  animateGlow(glow, time)
  filamentTime.value = time
  composer?.render()
  if (sea && camera) sea.renderOverlay(camera)
}

// Judged only at the idle rate, where the preview spends nearly all its
// time: a device that keeps up with that keeps the full look, even if a
// drag runs below 60 fps.
function timeFrame(dtMs: number, fps: number) {
  if (fps !== perf.fps) {
    perf.fps = fps
    perf.samples.length = 0
  }
  if (fps !== IDLE_FPS || dtMs > 250 || loading.value) return
  perf.samples.push(dtMs)
  if (perf.samples.length < 45) return
  const sorted = perf.samples.sort((a, b) => a - b)
  const typical = sorted[Math.floor(sorted.length * 0.6)]!
  perf.samples.length = 0
  if (typical <= (1000 / fps) * 1.35) return
  if (gtao?.enabled) gtao.enabled = false
  else if (dpr > 1) {
    dpr = 1
    setSize()
  }
}

watch(container, (el) => {
  if (el && !renderer) init(el)
}, { flush: 'post', immediate: true })

onBeforeUnmount(() => {
  stop()
  resizeObs?.disconnect()
  io?.disconnect()
  document.removeEventListener('visibilitychange', onVisibility)
  controls?.dispose()
  kit.dispose()
  hullMaterial?.dispose()
  sea?.dispose()
  gtao?.dispose()
  composer?.dispose()
  renderer?.dispose()
  if (renderer && container.value?.contains(renderer.domElement)) container.value.removeChild(renderer.domElement)
  scene = camera = controls = renderer = hullMaterial = composer = gtao = sea = null
})

watch(() => props.hullColor, () => {
  const ship = data.ships[props.ship]
  if (!hullMaterial || !ship) return
  // A plain swatch replaces a gradient or translucent filament outright, and
  // back again, so rebuild rather than patch the material in place.
  if (props.hullColor && !hullMaterial.vertexColors && !(hullMaterial as THREE.MeshPhysicalMaterial).isMeshPhysicalMaterial) {
    hullMaterial.color.set(props.hullColor)
  } else {
    build(props.ship)
  }
})

watch(() => props.ship, next => build(next))

function stopRotation() {
  if (controls) controls.autoRotate = false
  wake()
}
</script>

<template>
  <div class="relative w-full h-full ship-stage">
    <div
      ref="container"
      class="w-full h-full cursor-grab active:cursor-grabbing touch-none"
      :aria-label="alt ?? '3D ship preview'"
      role="img"
      @pointerdown="stopRotation"
      @wheel="stopRotation"
    />
    <div v-if="loading" class="absolute inset-0 flex items-center justify-center text-ink-soft text-sm pointer-events-none">
      <UIcon name="i-lucide-loader-2" class="size-5 animate-spin mr-2" /> Loading 3D model…
    </div>
    <div v-else-if="errored" class="absolute inset-0 flex items-center justify-center text-error-400 text-sm">
      Could not load the 3D preview.
    </div>
    <div v-else class="absolute bottom-2 right-3 text-xs uppercase tracking-wider text-ink-faint pointer-events-none">
      Drag to rotate · scroll to zoom
    </div>
  </div>
</template>

<style scoped>
.ship-stage {
  /* What shows while the scene loads: the same sky, falling to the sea. */
  background: linear-gradient(180deg, #5f97c4 0%, #dce8ee 58%, #2e7f93 58.2%, #235f6e 100%);
}
</style>
