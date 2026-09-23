<script setup lang="ts">
// Interactive 3D view of one fully assembled ship.
//
// Everything about how a ship goes together (hull, fittings, which part in
// which socket, facing which way, in which filament) comes from
// shared/data/ship-assemblies.json; this component only loads the meshes
// that file names and applies its transforms. Correct a placement there, not
// here. The meshes are the decimated previews built by
// scripts/blender/build_preview_meshes.py, in hull-STL millimetres, Z up.
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { mergeVertices, toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import assemblies from '#shared/data/ship-assemblies.json'
import { createSea, type Atmosphere } from '~/lib/seaScene'

type Vec3 = [number, number, number]
type PaletteEntry = { color: string, metalness?: number, roughness?: number, gradientZ?: string[], transmission?: number }
type Part = { preview: string, anchor?: Vec3, height?: number, holes?: [number, number][], sail?: boolean, printUp?: Vec3 }
type Placement = { part: string, at?: Vec3, rotX?: number, rotZ?: number, color: string, onMast?: number, holeFromTop?: number, sailBottom?: number, chordRatio?: number }
type Glow = { color: string, emissive: number, lights: Vec3[], intensity: number }
type Gleam = { color: string, strength: number }
type Ship = {
  title: string
  atmosphere?: string
  glow?: Glow
  gleam?: Gleam
  hull: { preview: string, color: string }
  fittings?: { name: string, preview: string, color: string }[]
  placements: Placement[]
}
type Scenery = { waterLevel: number, terrain: Placement[], atmospheres: Record<string, Atmosphere> }
const data = assemblies as unknown as {
  palette: Record<string, PaletteEntry>
  parts: Record<string, Part>
  scene: Scenery
  ships: Record<string, Ship>
}

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
let glow: { spec: Glow, mats: THREE.MeshStandardMaterial[], lights: THREE.PointLight[] } | null = null
const clock = new THREE.Clock()
let hullMaterial: THREE.MeshStandardMaterial | null = null
const materials = new Map<string, THREE.MeshStandardMaterial>()
let raf = 0
let resizeObs: ResizeObserver | null = null

// Meshes are shared across ships (every hull uses the same cannon), so cache
// them by URL for the life of the page: the welded mesh as loaded, and the
// shaded version most parts use as-is.
const rawCache = new Map<string, Promise<THREE.BufferGeometry>>()
const geomCache = new Map<string, Promise<THREE.BufferGeometry>>()
const loader = new GLTFLoader()

function loadRaw(url: string): Promise<THREE.BufferGeometry> {
  if (!rawCache.has(url)) {
    rawCache.set(url, loader.loadAsync(url).then((gltf) => {
      let found: THREE.BufferGeometry | null = null
      gltf.scene.traverse((o) => {
        if (!found && (o as THREE.Mesh).isMesh) found = (o as THREE.Mesh).geometry
      })
      if (!found) throw new Error(`no mesh in ${url}`)
      return mergeVertices(found as THREE.BufferGeometry, 1e-3)
    }))
  }
  return rawCache.get(url)!
}

// The previews ship without normals. Crease them: smooth across curved
// surfaces, crisp at real edges, so a decimated hull looks neither faceted
// nor melted.
function shade(welded: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = toCreasedNormals(welded, THREE.MathUtils.degToRad(35))
  g.computeBoundingBox()
  return g
}

// `printUp` (the part's print-bed up axis, in its own space) rides along as a
// constant vertex attribute, so one shared material can draw layer lines the
// right way on every part, whichever way it was printed or placed.
function withPrintUp(g: THREE.BufferGeometry, up: Vec3): THREE.BufferGeometry {
  const n = g.getAttribute('position').count
  const a = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) a.set(up, i * 3)
  g.setAttribute('printUp', new THREE.BufferAttribute(a, 3))
  return g
}

function loadGeometry(url: string, printUp: Vec3 = [0, 0, 1]): Promise<THREE.BufferGeometry> {
  const key = `${url}|${printUp.join(',')}`
  if (!geomCache.has(key)) geomCache.set(key, loadRaw(url).then(g => withPrintUp(shade(g), printUp)))
  return geomCache.get(key)!
}

// Thread a flat sail onto its mast. The sheet (in its STL's XY) passes the
// mast at each hole and bows out between them, alternately toward the bow and
// the stern, as a circular arc whose straight-line gap is `chordRatio` of the
// sheet length between the holes. Beyond the end holes the sheet runs on
// along the arc's tangent. Returns the bent sheet anchored at its lowest hole
// with the mast along +Z and the first belly toward the bow (-X), plus the
// height of its top hole above that anchor.
function arcAngle(ratio: number): number {
  // Solve sin(t/2)/(t/2) = ratio for the arc's subtended angle t.
  let lo = 1e-4
  let hi = 2 * Math.PI - 1e-4
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2
    if (Math.sin(mid / 2) / (mid / 2) > ratio) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

function bendSail(flat: THREE.BufferGeometry, holes: [number, number][], chordRatio: number) {
  const [x0, y0] = holes[0]!
  const [xn, yn] = holes[holes.length - 1]!
  const len = Math.hypot(xn - x0, yn - y0)
  const ax = (xn - x0) / len
  const ay = (yn - y0) / len
  const along = (x: number, y: number) => (x - x0) * ax + (y - y0) * ay
  const stops = holes.map(([x, y]) => along(x, y))
  const segs = stops.slice(0, -1).map((s0, i) => {
    const L = stops[i + 1]! - s0
    const c = Math.min(chordRatio, 0.999) * L
    const th = arcAngle(c / L)
    return { s0, L, c, th, R: L / th, d: i % 2 === 0 ? 1 : -1, z0: 0 }
  })
  let z = 0
  for (const sg of segs) { sg.z0 = z; z += sg.c }
  const span = z
  const first = segs[0]!
  const last = segs[segs.length - 1]!

  const g = flat.clone()
  const pos = g.getAttribute('position') as THREE.BufferAttribute
  g.computeBoundingBox()
  const zMid = (g.boundingBox!.min.z + g.boundingBox!.max.z) / 2
  for (let i = 0; i < pos.count; i++) {
    const px = pos.getX(i), py = pos.getY(i)
    const s = along(px, py)
    const u = -(px - x0) * ay + (py - y0) * ax
    const w = pos.getZ(i) - zMid
    let zz: number, fwd: number, nz: number, nf: number
    if (s <= 0) {
      const a = first.th / 2
      zz = s * Math.cos(a); fwd = s * first.d * Math.sin(a)
      nz = -first.d * Math.sin(a); nf = Math.cos(a)
    } else if (s >= stops[stops.length - 1]!) {
      const a = last.th / 2
      const t = s - stops[stops.length - 1]!
      zz = span + t * Math.cos(a); fwd = -t * last.d * Math.sin(a)
      nz = last.d * Math.sin(a); nf = Math.cos(a)
    } else {
      const sg = segs.find(q => s <= q.s0 + q.L) ?? last
      const a = sg.th / 2 - (s - sg.s0) / sg.R
      zz = sg.z0 + sg.c / 2 - sg.R * Math.sin(a)
      fwd = sg.d * sg.R * (Math.cos(a) - Math.cos(sg.th / 2))
      nz = -sg.d * Math.sin(a); nf = Math.cos(a)
    }
    pos.setXYZ(i, -(fwd + w * nf), u, zz + w * nz)
  }
  pos.needsUpdate = true
  // Two layers thick: no layer lines, so print-up is irrelevant; point it
  // through the sheet so only the top-skin pattern could ever show.
  return { geom: withPrintUp(shade(g), [0, 0, 1]), span }
}

// The printed-filament look, injected into MeshStandardMaterial.
//
// FDM prints are stacked beads of plastic, LAYER_MM tall, so the side walls
// are ribbed: every layer is a rounded bead with a small crevice above and
// below it. That relief is what catches the light, so it goes into the
// normal, not just the colour, with the crevices a touch darker and each
// layer's shade jittered slightly the way real extrusion drifts. Up-facing
// surfaces are the top skin instead: faint diagonal lines, no ribs.
//
// Layers stack along each part's print-bed up axis (the `printUp` vertex
// attribute, from ship-assemblies.json); `layers: false` turns them off.
// Everything fades out once a layer is smaller than a pixel, so a distant
// ship reads as smooth plastic instead of moiré.
const LAYER_MM = 0.2
// Shared clock for effects inside the filament shader (the gleam).
const filamentTime = { value: 0 }

function applyFilamentShader(mat: THREE.MeshStandardMaterial, layers: boolean) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uLayerH = { value: LAYER_MM }
    shader.uniforms.uRidge = { value: layers ? 0.55 : 0.0 }
    shader.uniforms.uSeam = { value: layers ? 0.14 : 0.0 }
    shader.uniforms.uTime = filamentTime
    shader.uniforms.uGleam = mat.userData.gleam
    shader.uniforms.uGleamColor = mat.userData.gleamColor
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 printUp;\nvarying vec3 vFilPos;\nvarying vec3 vFilNormal;\nvarying vec3 vFilUp;')
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        vFilPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vFilNormal = normalize(mat3(modelMatrix) * objectNormal);
        vFilUp = normalize(mat3(modelMatrix) * printUp);`)
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vFilPos;
        varying vec3 vFilNormal;
        varying vec3 vFilUp;
        uniform float uLayerH;
        uniform float uRidge;
        uniform float uSeam;
        uniform float uTime;
        uniform float uGleam;
        uniform vec3 uGleamColor;
        float filHash(float n) { return fract(sin(n * 127.1) * 43758.5453); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 filN = normalize(vFilNormal);
        vec3 filUpW = normalize(vFilUp);
        float filUpDot = dot(filN, filUpW);
        float filCoord = dot(vFilPos, filUpW) / uLayerH;
        float filFrac = fract(filCoord);
        // 1 while a layer spans a couple of pixels, 0 once it is sub-pixel.
        float filAA = clamp(1.6 - fwidth(filCoord) * 2.0, 0.0, 1.0);
        float filWall = 1.0 - smoothstep(0.72, 0.96, abs(filUpDot));
        float filBead = sin(3.14159265 * filFrac);
        float filShade = mix(1.0 - uSeam, 1.0, pow(filBead, 0.6))
          + (filHash(floor(filCoord)) - 0.5) * 0.035 * step(0.001, uSeam);
        diffuseColor.rgb *= mix(1.0, filShade, filWall * filAA);
        // Top skin: diagonal extrusion lines, two layer-widths apart.
        float filTop = smoothstep(0.86, 0.98, abs(filUpDot)) * step(0.001, uSeam);
        vec3 filT1 = normalize(cross(filUpW, abs(filUpW.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
        vec3 filT2 = cross(filUpW, filT1);
        float filDiag = dot(vFilPos, filT1 + filT2) / (uLayerH * 2.2 * 1.4142);
        float filDiagAA = clamp(1.6 - fwidth(filDiag) * 2.0, 0.0, 1.0);
        diffuseColor.rgb *= mix(1.0, 0.965 + 0.035 * sin(6.2831853 * filDiag), filTop * filDiagAA);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        if (uGleam > 0.0) {
          // Glints: only a rare cell of the gilding can flash, and briefly,
          // so there are one or two on the hull at any moment.
          vec3 gCell = floor(vFilPos * 0.9);
          float gH = fract(sin(dot(gCell, vec3(12.9898, 78.233, 45.164))) * 43758.5453);
          float gTwinkle = step(0.9965, gH) * pow(max(0.0, sin(uTime * 0.9 + gH * 900.0)), 80.0);
          // A sheen sweeping bow to stern every few seconds.
          float gSweepX = mod(uTime * 45.0, 420.0) - 210.0;
          float gSweep = exp(-pow((vFilPos.x - gSweepX + vFilPos.y * 0.6) / 14.0, 2.0));
          totalEmissiveRadiance += uGleamColor * uGleam * (gTwinkle * 2.2 + gSweep * 0.22);
        }`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          // Tilt the normal across each bead: up on its upper half, down on
          // its lower half, along the wall's own vertical.
          vec3 filUp = normalize((viewMatrix * vec4(filUpW, 0.0)).xyz);
          vec3 filT = filUp - normal * dot(normal, filUp);
          float filTl = length(filT);
          if (filTl > 1e-3) {
            filT /= filTl;
            normal = normalize(normal + uRidge * cos(3.14159265 * filFrac) * filWall * filAA * filT);
          }
        }`)
  }
  mat.customProgramCacheKey = () => `cnc-filament-${layers ? 1 : 0}`
}

function makeMaterial(key: string, override?: string | null, layers = true): THREE.MeshStandardMaterial {
  const p = data.palette[key] ?? { color: '#9a9a9a' }
  const opts = {
    color: new THREE.Color(override ?? p.color),
    // Matte-to-satin PLA: rough enough that the bead relief, not a mirror
    // highlight, is what reads.
    roughness: p.roughness ?? 0.62,
    metalness: p.metalness ?? 0.0,
    vertexColors: !override && !!p.gradientZ
  }
  const mat = p.transmission && !override
    ? new THREE.MeshPhysicalMaterial({ ...opts, transmission: p.transmission, thickness: 2, ior: 1.57 })
    : new THREE.MeshStandardMaterial(opts)
  if (mat.vertexColors) mat.color.set('#ffffff')
  mat.userData.paletteKey = key
  mat.userData.gleam = { value: 0 }
  mat.userData.gleamColor = { value: new THREE.Color('#ffffff') }
  applyFilamentShader(mat, layers)
  return mat
}

function material(key: string, layers = true) {
  const k = `${key}|${layers ? 'layers' : 'flat'}`
  if (!materials.has(k)) materials.set(k, makeMaterial(key, null, layers))
  return materials.get(k)!
}

// Sails are the same filament as anything else of their colour (the Shadow
// Fleet's are its gradient PETG), just seen from both sides and too thin
// for layer lines.
function sailMaterial(key: string) {
  const k = `${key}|sail`
  if (!materials.has(k)) {
    const m = makeMaterial(key, null, false)
    m.side = THREE.DoubleSide
    materials.set(k, m)
  }
  return materials.get(k)!
}

// Gradient filament (the Shadow Fleet's PETG) changes colour up the print,
// so it is baked per mesh from its own height, like the Blender renders.
function withGradient(geom: THREE.BufferGeometry, stops: string[]): THREE.BufferGeometry {
  const g = geom.clone()
  const pos = g.getAttribute('position')
  const bb = g.boundingBox!
  const cols = stops.map(s => new THREE.Color(s))
  const out = new Float32Array(pos.count * 3)
  const c = new THREE.Color()
  for (let i = 0; i < pos.count; i++) {
    const t = (pos.getZ(i) - bb.min.z) / Math.max(1e-6, bb.max.z - bb.min.z)
    const f = t * (cols.length - 1)
    const k = Math.min(cols.length - 2, Math.floor(f))
    c.copy(cols[k]!).lerp(cols[k + 1]!, f - k)
    out.set([c.r, c.g, c.b], i * 3)
  }
  g.setAttribute('color', new THREE.BufferAttribute(out, 3))
  return g
}

// world = at + Rz(rotZ) * Rx(rotX) * (p - anchor), as ship-assemblies.json defines it.
function placeMatrix(at: Vec3, rotZDeg: number, anchor: Vec3, rotXDeg = 0): THREE.Matrix4 {
  return new THREE.Matrix4().makeTranslation(at[0], at[1], at[2])
    .multiply(new THREE.Matrix4().makeRotationZ(THREE.MathUtils.degToRad(rotZDeg)))
    .multiply(new THREE.Matrix4().makeRotationX(THREE.MathUtils.degToRad(rotXDeg)))
    .multiply(new THREE.Matrix4().makeTranslation(-anchor[0], -anchor[1], -anchor[2]))
}

async function addMesh(group: THREE.Group, url: string | THREE.BufferGeometry, matKey: string, matrix: THREE.Matrix4 | null, mat?: THREE.Material, layers = true) {
  let geom = typeof url === 'string' ? await loadGeometry(url) : url
  const pal = data.palette[matKey]
  const useMat = mat ?? material(matKey, layers)
  if (pal?.gradientZ && (useMat as THREE.MeshStandardMaterial).vertexColors) geom = withGradient(geom, pal.gradientZ)
  const mesh = new THREE.Mesh(geom, useMat)
  if (matrix) {
    mesh.matrixAutoUpdate = false
    mesh.matrix.copy(matrix)
  }
  group.add(mesh)
}

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
    const group = new THREE.Group()
    const terrain = new THREE.Group()
    outer.add(group, terrain)

    hullMaterial?.dispose()
    hullMaterial = makeMaterial(ship.hull.color, props.hullColor)
    const jobs: Promise<void>[] = [addMesh(group, ship.hull.preview, ship.hull.color, null, hullMaterial)]
    for (const f of ship.fittings ?? []) jobs.push(addMesh(group, f.preview, f.color, null))
    for (const t of data.scene.terrain) {
      const part = data.parts[t.part]
      if (!part || !t.at) continue
      jobs.push(loadGeometry(part.preview, part.printUp).then(g => addMesh(terrain, g, t.color, placeMatrix(t.at!, t.rotZ ?? 0, part.anchor ?? [0, 0, 0]))))
    }

    const masts = ship.placements.filter(p => p.part.startsWith('mast'))
    for (const p of ship.placements) {
      const part = data.parts[p.part]
      if (!part) continue
      if (part.sail) {
        const mast = masts[p.onMast ?? 0]
        const mastPart = mast && data.parts[mast.part]
        if (!mast?.at || !mastPart?.height || !part.holes) continue
        const sailPart = part
        const at = mast.at
        jobs.push(loadRaw(sailPart.preview).then((flat) => {
          const { geom, span } = bendSail(flat, sailPart.holes!, p.chordRatio ?? 0.88)
          // Hung either by its lowest edge (sailBottom, a hull height) or by
          // its top hole's distance below the mast top.
          const z = p.sailBottom !== undefined
            ? p.sailBottom - geom.boundingBox!.min.z
            : at[2] + mastPart.height - (p.holeFromTop ?? 6) - span
          return addMesh(group, geom, p.color, placeMatrix([at[0], at[1], z], p.rotZ ?? 0, [0, 0, 0]), sailMaterial(p.color), false)
        }))
        continue
      }
      if (!p.at) continue
      jobs.push(loadGeometry(part.preview, part.printUp).then(g => addMesh(group, g, p.color, placeMatrix(p.at, p.rotZ ?? 0, part.anchor ?? [0, 0, 0], p.rotX ?? 0))))
    }
    await Promise.all(jobs)

    sea?.apply(data.scene.atmospheres[ship.atmosphere ?? 'fair'] ?? data.scene.atmospheres.fair!)
    setupGlow(ship, group)
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

// The glow lives in the ship's own filament: every material of the hull's
// palette colour gets an emissive tint, and point lights inside the hull
// spill it onto whatever faces them (deck, sails, the sea around it).
function setupGlow(ship: Ship, group: THREE.Group) {
  for (const l of glow?.lights ?? []) l.removeFromParent()
  glow = null
  // Gleam: switch it on for the hull's filament, off for everything else.
  group.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined
    if (!m?.userData?.gleam) return
    const on = !!ship.gleam && m.userData.paletteKey === ship.hull.color
    m.userData.gleam.value = on ? ship.gleam!.strength : 0
    if (on) m.userData.gleamColor.value.set(ship.gleam!.color)
  })
  if (!ship.glow) return
  const color = new THREE.Color(ship.glow.color)
  const mats = new Set<THREE.MeshStandardMaterial>()
  group.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined
    if (m && m.userData?.paletteKey === ship.hull.color) mats.add(m)
  })
  for (const m of mats) m.emissive.copy(color)
  const lights = ship.glow.lights.map((at) => {
    const l = new THREE.PointLight(color, 0, 0, 2)
    l.position.set(at[0], at[1], at[2])
    group.add(l)
    return l
  })
  glow = { spec: ship.glow, mats: [...mats], lights }
}

function animateGlow(t: number) {
  if (!glow) return
  // Only ever slow: a breath every few seconds, with each light drifting a
  // little out of step with the others. Nothing flickers.
  const k = 0.78 + 0.22 * Math.sin(t * 0.9) + 0.06 * Math.sin(t * 0.37 + 1.3)
  for (const m of glow.mats) m.emissiveIntensity = glow.spec.emissive * k
  glow.lights.forEach((l, i) => { l.intensity = glow!.spec.intensity * k * (0.88 + 0.12 * Math.sin(t * 0.6 + i * 2.1)) })
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
    animateGlow(clock.getElapsedTime())
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
  for (const m of materials.values()) m.dispose()
  materials.clear()
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
