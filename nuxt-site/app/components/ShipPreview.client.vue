<script setup lang="ts">
import * as THREE from 'three'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { ShipPlacement } from '~/composables/useShop'

const props = defineProps<{
  modelUrl: string
  placements?: ShipPlacement[]
  color: string
  alt?: string
}>()

const container = ref<HTMLDivElement | null>(null)
const loading = ref(true)
const errored = ref(false)

let renderer: THREE.WebGLRenderer | null = null
let scene: THREE.Scene | null = null
let camera: THREE.PerspectiveCamera | null = null
let controls: OrbitControls | null = null
let shipGroup: THREE.Group | null = null
let material: THREE.MeshStandardMaterial | null = null
let cannonMaterial: THREE.MeshStandardMaterial | null = null
let raf = 0
let resizeObs: ResizeObserver | null = null

// Shared part STLs — loaded once and reused across re-renders / variants.
const partUrls: Record<ShipPlacement['type'], string> = {
  'mast':            '/assets/stls/cannons-and-coastlines-base-set-0.3/mast.stl',
  'cannon':          '/assets/stls/cannons-and-coastlines-base-set-0.3/cannon.stl',
  'movement-wheel':  '/assets/stls/cannons-and-coastlines-base-set-0.3/movement-wheel.stl'
}

// Default object-space rotations applied when a placement doesn't specify
// one. Source STLs are modeled lying flat for printing, so we tip each part
// up onto its base. A placement's explicit `rotation` overrides this.
const partDefaultRotation: Record<ShipPlacement['type'], [number, number, number]> = {
  'mast':           [-Math.PI / 2, 0, 0],
  'cannon':         [-Math.PI / 2, 0, 0],
  'movement-wheel': [-Math.PI / 2, 0, 0]
}
const geomCache = new Map<string, THREE.BufferGeometry>()

async function loadGeometry(url: string): Promise<THREE.BufferGeometry> {
  if (geomCache.has(url)) return geomCache.get(url)!
  const loader = new STLLoader()
  const raw = await loader.loadAsync(url)
  // STLLoader emits per-triangle flat normals. Strip them, merge by position
  // only, then recompute smooth vertex normals.
  raw.deleteAttribute('normal')
  const g = mergeVertices(raw, 1e-4)
  g.computeVertexNormals()
  g.computeBoundingBox()
  geomCache.set(url, g)
  return g
}

function luminance(c: string): number {
  const tmp = new THREE.Color(c)
  const lin = (x: number) => x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)
  return 0.2126 * lin(tmp.r) + 0.7152 * lin(tmp.g) + 0.0722 * lin(tmp.b)
}

const backgroundColor = computed(() => luminance(props.color) > 0.55
  ? 'linear-gradient(160deg, #1c3344 0%, #0f1d28 100%)'
  : 'linear-gradient(160deg, #c9dceb 0%, #8fb1c8 100%)')

// World-space "layer line" tinting injected into a MeshStandardMaterial.
// Bypasses UVs entirely so it works across hull, masts, cannons, wheels —
// every fragment is tinted by a triangle wave of its world Y. Density
// multiplies 6× when viewed top-down where bands compress visually.
function applyLayerLinesShader(
  mat: THREE.MeshStandardMaterial,
  layersPerUnit: number,
  colorStrength: number
) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uLayerFreq = { value: layersPerUnit }
    shader.uniforms.uLayerTint = { value: colorStrength }

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `
        #include <common>
        varying vec3 vWorldPosLayer;
      `)
      .replace('#include <worldpos_vertex>', `
        #include <worldpos_vertex>
        vWorldPosLayer = (modelMatrix * vec4(transformed, 1.0)).xyz;
      `)

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `
        #include <common>
        varying vec3 vWorldPosLayer;
        uniform float uLayerFreq;
        uniform float uLayerTint;
      `)
      .replace('#include <color_fragment>', `
        #include <color_fragment>
        {
          vec3 viewDir = normalize(cameraPosition - vWorldPosLayer);
          float topDown = smoothstep(0.55, 0.95, abs(viewDir.y));
          float freq = mix(uLayerFreq, uLayerFreq * 6.0, topDown);
          float t = fract(vWorldPosLayer.y * freq);
          float h = abs(t - 0.5) * 2.0;
          float tint = mix(1.0 - uLayerTint, 1.0 + uLayerTint, h);
          diffuseColor.rgb *= tint;
        }
      `)
  }
  mat.customProgramCacheKey = () => 'cnc-layer-lines'
}

function fitCamera() {
  if (!shipGroup || !camera || !controls) return
  const box = new THREE.Box3().setFromObject(shipGroup)
  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())
  shipGroup.position.sub(center) // re-center on origin
  const maxDim = Math.max(size.x, size.y, size.z)
  const fov = camera.fov * (Math.PI / 180)
  const dist = (maxDim / 2) / Math.tan(fov / 2) * 0.75
  camera.position.set(dist * 0.7, dist * 0.5, dist)
  camera.near = dist / 100
  camera.far = dist * 10
  camera.updateProjectionMatrix()
  controls.target.set(0, 0, 0)
  controls.update()
}

function setSize() {
  if (!renderer || !camera || !container.value) return
  const w = container.value.clientWidth
  const h = container.value.clientHeight
  if (w === 0 || h === 0) return
  // updateStyle = true (default): three.js sets canvas.style.{width,height}
  // to the requested CSS pixel size while making the bitmap pixelRatio× as
  // large for crispness. Passing false here causes the canvas to display at
  // its bitmap size (2× the container at devicePixelRatio 2), which then
  // grows the container, retriggers the ResizeObserver, and spirals.
  renderer.setSize(w, h)
  camera.aspect = w / h
  camera.updateProjectionMatrix()
}

function disposeShipGroup() {
  if (!shipGroup || !scene) return
  scene.remove(shipGroup)
  // Geometries are shared via geomCache; don't dispose them here.
  shipGroup = null
}

async function loadModel(url: string, placements: ShipPlacement[]) {
  if (!scene) return
  loading.value = true
  errored.value = false
  try {
    disposeShipGroup()

    // Hull / mast / wheel material — repainted when the variant changes.
    material?.dispose()
    material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(props.color),
      roughness: 0.75,
      metalness: 0.05,
      flatShading: false
    })
    applyLayerLinesShader(material, 3.0, 0.2)

    // Cannons always render black regardless of filament selection — they're
    // cast metal in the game's fiction. Separate material so the color watch
    // can't repaint them.
    cannonMaterial?.dispose()
    cannonMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#0a0a0a'),
      roughness: 0.5,
      metalness: 0.35,
      flatShading: false
    })
    applyLayerLinesShader(cannonMaterial, 3.0, 0.2)

    const group = new THREE.Group()
    // STLs are typically Z-up; rotate the whole group so model-Z becomes
    // world-Y. Parts placed in the hull's object space follow along.
    group.rotation.x = -Math.PI / 2

    // Hull
    const hullGeom = await loadGeometry(url)
    const hullBB = hullGeom.boundingBox!
    const hullSize = hullBB.getSize(new THREE.Vector3())
    group.add(new THREE.Mesh(hullGeom, material!))

    // Insert parts at hull-bounding-box-relative positions (object space,
    // before the group rotation). Each part is anchored at its own bbox-min Z
    // so the natural base sits at the placement point — masts root on deck,
    // cannons/wheels rest on their base, etc.
    for (const placement of placements) {
      const partUrl = partUrls[placement.type]
      if (!partUrl) continue
      const partGeom = await loadGeometry(partUrl)

      const partMaterial = placement.type === 'cannon' ? cannonMaterial! : material!
      const partMesh = new THREE.Mesh(partGeom, partMaterial)
      // Rotation: explicit per-placement wins, else the type default that
      // tips the part upright from its print-bed orientation.
      const rot = placement.rotation ?? partDefaultRotation[placement.type] ?? [0, 0, 0]
      partMesh.rotation.set(rot[0], rot[1], rot[2])
      if (placement.scale) partMesh.scale.setScalar(placement.scale)
      partMesh.updateMatrix()

      // Anchor the rotated part by its lowest point in mesh-local space, so
      // mast/cannon/wheel bases all sit at the requested placement Z.
      const rotatedBB = partGeom.boundingBox!.clone().applyMatrix4(partMesh.matrix)
      const px = hullBB.min.x + hullSize.x * placement.position[0]
      const py = hullBB.min.y + hullSize.y * placement.position[1]
      const pz = hullBB.min.z + hullSize.z * placement.position[2] - rotatedBB.min.z

      partMesh.position.set(px, py, pz)
      group.add(partMesh)
    }

    scene.add(group)
    shipGroup = group
    fitCamera()
  } catch (err) {
    console.error('STL load failed', err)
    errored.value = true
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  if (!container.value) return

  scene = new THREE.Scene()
  scene.background = null
  camera = new THREE.PerspectiveCamera(40, 1, 0.1, 1000)

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  // Block-level so the canvas doesn't add inline whitespace below itself
  // (which would also feed back into the ResizeObserver).
  renderer.domElement.style.display = 'block'
  container.value.appendChild(renderer.domElement)

  scene.add(new THREE.HemisphereLight(0xddeaf4, 0x1a2030, 0.85))
  const key = new THREE.DirectionalLight(0xffffff, 1.6)
  key.position.set(4, 6, 5)
  scene.add(key)
  const rim = new THREE.DirectionalLight(0x99bbdd, 0.7)
  rim.position.set(-5, 2, -3)
  scene.add(rim)

  controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.08
  controls.enablePan = false
  controls.autoRotate = true
  controls.autoRotateSpeed = 0.7

  setSize()
  resizeObs = new ResizeObserver(setSize)
  resizeObs.observe(container.value)

  const tick = () => {
    raf = requestAnimationFrame(tick)
    controls?.update()
    if (renderer && scene && camera) renderer.render(scene, camera)
  }
  tick()

  await loadModel(props.modelUrl, props.placements ?? [])
})

onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
  resizeObs?.disconnect()
  controls?.dispose()
  disposeShipGroup()
  material?.dispose()
  cannonMaterial?.dispose()
  renderer?.dispose()
  if (renderer && container.value?.contains(renderer.domElement)) {
    container.value.removeChild(renderer.domElement)
  }
  scene = camera = controls = material = renderer = null
})

watch(() => props.color, (next) => {
  if (material) material.color.set(next)
})

watch(() => [props.modelUrl, props.placements], () => {
  if (props.modelUrl) loadModel(props.modelUrl, props.placements ?? [])
}, { deep: true })

function stopRotation() {
  if (controls) controls.autoRotate = false
}
</script>

<template>
  <div class="relative w-full h-full transition-[background] duration-500" :style="{ background: backgroundColor }">
    <div
      ref="container"
      class="w-full h-full cursor-grab active:cursor-grabbing"
      :aria-label="alt ?? '3D ship preview'"
      role="img"
      @pointerdown="stopRotation"
      @wheel="stopRotation"
    />
    <div
      v-if="loading"
      class="absolute inset-0 flex items-center justify-center text-white/60 text-sm pointer-events-none"
    >
      <UIcon name="i-lucide-loader-2" class="size-5 animate-spin mr-2" /> Loading 3D model…
    </div>
    <div
      v-else-if="errored"
      class="absolute inset-0 flex items-center justify-center text-error-300 text-sm"
    >
      Could not load preview.
    </div>
    <div v-else class="absolute bottom-2 right-3 text-[10px] uppercase tracking-wider text-white/40 pointer-events-none">
      Drag to rotate
    </div>
  </div>
</template>
