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
const clock = new THREE.Clock()
let hullMaterial: THREE.MeshStandardMaterial | null = null
const kit = createAssemblyKit()
let raf = 0
let resizeObs: ResizeObserver | null = null

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
  const w = container.value.clientWidth
  const h = container.value.clientHeight
  if (w === 0 || h === 0) return
  // updateStyle stays on: without it the canvas displays at its bitmap size,
  // grows the container and feeds the ResizeObserver forever.
  renderer.setSize(w, h)
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
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
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
  gtao = new GTAOPass(scene, camera, el.clientWidth || 800, el.clientHeight || 600)
  gtao.updateGtaoMaterial({ radius: 4, distanceExponent: 1.4, thickness: 2, scale: 1.1, samples: 16, distanceFallOff: 1, screenSpaceRadius: false })
  gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 })
  gtao.blendIntensity = 1.0
  composer.addPass(gtao)
  composer.addPass(new OutputPass())

  // Sky, sea, weather and lights, set per ship from its atmosphere.
  sea = createSea(renderer, scene, data.scene.waterLevel)

  controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.08
  controls.enablePan = false
  controls.autoRotate = true
  controls.autoRotateSpeed = 0.6

  setSize()
  resizeObs = new ResizeObserver(setSize)
  resizeObs.observe(el)

  const tick = () => {
    raf = requestAnimationFrame(tick)
    controls?.update()
    if (sea && controls) sea.update(clock.getElapsedTime(), controls.target)
    animateGlow(glow, clock.getElapsedTime())
    filamentTime.value = clock.getElapsedTime()
    if (composer) composer.render()
    if (sea && camera) sea.renderOverlay(camera)
  }
  tick()
  await build(props.ship)
}

watch(container, (el) => {
  if (el && !renderer) init(el)
}, { flush: 'post', immediate: true })

onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
  resizeObs?.disconnect()
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
