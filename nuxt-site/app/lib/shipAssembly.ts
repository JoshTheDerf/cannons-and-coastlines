// Assembled ships in three.js, shared by the shop's 3D preview
// (components/ShipPreview.client.vue) and the web game (lib/game3d.ts).
//
// Everything about how a ship goes together (hull, fittings, which part in
// which socket, facing which way, in which filament) comes from
// shared/data/ship-assemblies.json; this file only loads the meshes that file
// names and applies its transforms. Correct a placement there, not here. The
// meshes are the decimated previews built by
// scripts/blender/build_preview_meshes.py, in hull-STL millimetres, Z up.
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { mergeVertices, toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import assemblies from '../../shared/data/ship-assemblies.json'
import type { Atmosphere } from './seaScene'

export type Vec3 = [number, number, number]
export type PaletteEntry = { color: string, metalness?: number, roughness?: number, gradientZ?: string[], transmission?: number }
export type Part = { preview: string, anchor?: Vec3, height?: number, holes?: [number, number][], sail?: boolean, printUp?: Vec3, radius?: number }
export type Placement = { part: string, at?: Vec3, rotX?: number, rotZ?: number, color: string, onMast?: number, holeFromTop?: number, sailBottom?: number, chordRatio?: number }
export type Glow = { color: string, emissive: number, lights: Vec3[], intensity: number }
export type Gleam = { color: string, strength: number }
export type Socket = { at: Vec3, rotZ?: number, where?: string, along?: string }
export type Ship = {
  title: string
  atmosphere?: string
  glow?: Glow
  gleam?: Gleam
  hull: { preview: string, color: string }
  fittings?: { name: string, preview: string, color: string }[]
  placements: Placement[]
  sockets?: { cannon?: Socket[], coin?: Socket[] }
}
export type Scenery = { waterLevel: number, terrain: Placement[], atmospheres: Record<string, Atmosphere> }
export const data = assemblies as unknown as {
  palette: Record<string, PaletteEntry>
  parts: Record<string, Part>
  scene: Scenery
  ships: Record<string, Ship>
}

// ── Geometry ─────────────────────────────────────────────────────────
// Meshes are shared across ships (every hull uses the same cannon), so cache
// them by URL for the life of the page: the welded mesh as loaded, and the
// shaded version most parts use as-is.
const rawCache = new Map<string, Promise<THREE.BufferGeometry>>()
const geomCache = new Map<string, Promise<THREE.BufferGeometry>>()
const loader = new GLTFLoader()

export function loadRaw(url: string): Promise<THREE.BufferGeometry> {
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
export function shade(welded: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = toCreasedNormals(welded, THREE.MathUtils.degToRad(35))
  g.computeBoundingBox()
  return g
}

// `printUp` (the part's print-bed up axis, in its own space) rides along as a
// constant vertex attribute, so one shared material can draw layer lines the
// right way on every part, whichever way it was printed or placed.
export function withPrintUp(g: THREE.BufferGeometry, up: Vec3): THREE.BufferGeometry {
  const n = g.getAttribute('position').count
  const a = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) a.set(up, i * 3)
  g.setAttribute('printUp', new THREE.BufferAttribute(a, 3))
  return g
}

export function loadGeometry(url: string, printUp: Vec3 = [0, 0, 1]): Promise<THREE.BufferGeometry> {
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

export function bendSail(flat: THREE.BufferGeometry, holes: [number, number][], chordRatio: number) {
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

// Gradient filament (the Shadow Fleet's PETG) changes colour up the print,
// so it is baked per mesh from its own height, like the Blender renders.
export function withGradient(geom: THREE.BufferGeometry, stops: string[]): THREE.BufferGeometry {
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
export function placeMatrix(at: Vec3, rotZDeg: number, anchor: Vec3, rotXDeg = 0): THREE.Matrix4 {
  return new THREE.Matrix4().makeTranslation(at[0], at[1], at[2])
    .multiply(new THREE.Matrix4().makeRotationZ(THREE.MathUtils.degToRad(rotZDeg)))
    .multiply(new THREE.Matrix4().makeRotationX(THREE.MathUtils.degToRad(rotXDeg)))
    .multiply(new THREE.Matrix4().makeTranslation(-anchor[0], -anchor[1], -anchor[2]))
}

// ── Filament material ────────────────────────────────────────────────
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
// Shared clock for effects inside the filament shader (the gleam). Set it
// each frame.
export const filamentTime = { value: 0 }

export function applyFilamentShader(mat: THREE.MeshStandardMaterial, layers: boolean) {
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

export function makeMaterial(key: string, override?: string | null, layers = true): THREE.MeshStandardMaterial {
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

// ── Assembling a ship ────────────────────────────────────────────────

/** What each piece of an assembled ship is, so a caller can take fittings off or move the gun. */
export type ShipRig = {
  group: THREE.Group
  hull: THREE.Mesh[]
  /** Masts from bow to stern, each with the sails hung on it. */
  masts: { mesh: THREE.Mesh, sails: THREE.Mesh[], x: number }[]
  /** Cargo and barrels from bow to stern. */
  cargo: { mesh: THREE.Mesh, x: number }[]
  /** Industry: the turret and the gun on it, turning about `pivot` (hull XY). */
  turret: { meshes: THREE.Mesh[], pivot: [number, number] } | null
  stack: THREE.Mesh | null
  /** Guns that are not on a turret, with the placement they were built at. */
  cannons: { mesh: THREE.Mesh, placement: Placement }[]
  coin: THREE.Mesh | null
  wheel: THREE.Mesh | null
}

/**
 * Materials for one viewer. Keep one kit per renderer and dispose() it with
 * the renderer; geometry is cached for the whole page. `meshUrl` swaps the
 * JSON's preview URLs for another set (the game's lighter meshes).
 */
export function createAssemblyKit(opts: { meshUrl?: (url: string) => string } = {}) {
  const meshUrl = opts.meshUrl ?? ((u: string) => u)
  const materials = new Map<string, THREE.MeshStandardMaterial>()

  function material(key: string, layers = true) {
    const k = `${key}|${layers ? 'layers' : 'flat'}`
    if (!materials.has(k)) materials.set(k, makeMaterial(key, null, layers))
    return materials.get(k)!
  }

  // Sails are the same filament as anything else of their colour (the
  // Shadow Fleet's are its gradient PETG), just seen from both sides and
  // too thin for layer lines.
  function sailMaterial(key: string) {
    const k = `${key}|sail`
    if (!materials.has(k)) {
      const m = makeMaterial(key, null, false)
      m.side = THREE.DoubleSide
      materials.set(k, m)
    }
    return materials.get(k)!
  }

  async function mesh(url: string | THREE.BufferGeometry, matKey: string, matrix: THREE.Matrix4 | null, mat?: THREE.Material, layers = true, printUp?: Vec3) {
    let geom = typeof url === 'string' ? await loadGeometry(meshUrl(url), printUp) : url
    const pal = data.palette[matKey]
    const useMat = mat ?? material(matKey, layers)
    if (pal?.gradientZ && (useMat as THREE.MeshStandardMaterial).vertexColors) geom = withGradient(geom, pal.gradientZ)
    const m = new THREE.Mesh(geom, useMat)
    if (matrix) {
      m.matrixAutoUpdate = false
      m.matrix.copy(matrix)
    }
    return m
  }

  /**
   * Build a ship in hull space (mm, Z up, bow toward -X). `hullMaterial`
   * replaces the hull's own filament (a colour variant). Every placement in
   * the JSON is built, so the caller decides what to show.
   */
  async function buildShip(shipKey: string, hullMaterial?: THREE.MeshStandardMaterial | null): Promise<ShipRig> {
    const ship = data.ships[shipKey]
    if (!ship) throw new Error(`unknown ship ${shipKey}`)
    const group = new THREE.Group()
    const rig: ShipRig = { group, hull: [], masts: [], cargo: [], turret: null, stack: null, cannons: [], coin: null, wheel: null }
    const turretSockets = (ship.sockets?.cannon ?? []).filter(s => s.where?.startsWith('turret'))
    const onTurret = (p: Placement) => turretSockets.some(s => p.at && Math.hypot(s.at[0] - p.at[0], s.at[1] - p.at[1]) < 0.5)
    const turretMeshes: THREE.Mesh[] = []

    const jobs: Promise<void>[] = []
    jobs.push(mesh(ship.hull.preview, ship.hull.color, null, hullMaterial ?? undefined).then((m) => { rig.hull.push(m) }))
    for (const f of ship.fittings ?? []) {
      jobs.push(mesh(f.preview, f.color, null).then((m) => {
        if (f.name.includes('turret')) turretMeshes.push(m)
        else if (f.name.includes('smokestack')) rig.stack = m
        else rig.hull.push(m)
      }))
    }
    const masts = ship.placements.filter(p => p.part.startsWith('mast'))
    const mastEntries = masts.map(p => ({ mesh: null as unknown as THREE.Mesh, sails: [] as THREE.Mesh[], x: p.at?.[0] ?? 0 }))
    for (const p of ship.placements) {
      const part = data.parts[p.part]
      if (!part) continue
      if (part.sail) {
        const mi = p.onMast ?? 0
        const mast = masts[mi]
        const mastPart = mast && data.parts[mast.part]
        if (!mast?.at || !mastPart?.height || !part.holes) continue
        const sailPart = part
        const at = mast.at
        jobs.push(loadRaw(meshUrl(sailPart.preview)).then(async (flat) => {
          const { geom, span } = bendSail(flat, sailPart.holes!, p.chordRatio ?? 0.88)
          // Hung either by its lowest edge (sailBottom, a hull height) or by
          // its top hole's distance below the mast top.
          const z = p.sailBottom !== undefined
            ? p.sailBottom - geom.boundingBox!.min.z
            : at[2] + mastPart.height! - (p.holeFromTop ?? 6) - span
          const m = await mesh(geom, p.color, placeMatrix([at[0], at[1], z], p.rotZ ?? 0, [0, 0, 0]), sailMaterial(p.color), false)
          mastEntries[mi]!.sails.push(m)
        }))
        continue
      }
      if (!p.at) continue
      const matrix = placeMatrix(p.at, p.rotZ ?? 0, part.anchor ?? [0, 0, 0], p.rotX ?? 0)
      jobs.push(mesh(part.preview, p.color, matrix, undefined, true, part.printUp).then((m) => {
        m.userData.placement = p
        if (p.part.startsWith('mast')) mastEntries[masts.indexOf(p)]!.mesh = m
        else if (p.part === 'cargo' || p.part === 'barrel') rig.cargo.push({ mesh: m, x: p.at![0] })
        else if (p.part === 'cannon') {
          if (onTurret(p)) turretMeshes.push(m)
          else rig.cannons.push({ mesh: m, placement: p })
        } else if (p.part.startsWith('coin')) rig.coin = m
        else if (p.part === 'movement-wheel') rig.wheel = m
        else rig.hull.push(m)
      }))
    }
    await Promise.all(jobs)

    rig.masts = mastEntries.filter(e => e.mesh).sort((a, b) => a.x - b.x)
    rig.cargo.sort((a, b) => a.x - b.x)
    if (turretMeshes.length) {
      const s = turretSockets[0]
      rig.turret = { meshes: turretMeshes, pivot: s ? [s.at[0], s.at[1]] : [0, 0] }
    }
    const all: THREE.Object3D[] = [...rig.hull, ...rig.masts.flatMap(m => [m.mesh, ...m.sails]), ...rig.cargo.map(c => c.mesh),
      ...turretMeshes, ...rig.cannons.map(c => c.mesh)]
    if (rig.stack) all.push(rig.stack)
    if (rig.coin) all.push(rig.coin)
    if (rig.wheel) all.push(rig.wheel)
    group.add(...all)
    return rig
  }

  /** A terrain piece (rock, reef, island) in its own part space, anchored at its base. */
  async function buildPart(partKey: string, color: string): Promise<THREE.Mesh> {
    const part = data.parts[partKey]
    if (!part) throw new Error(`unknown part ${partKey}`)
    const g = await loadGeometry(meshUrl(part.preview), part.printUp)
    return mesh(g, color, placeMatrix([0, 0, 0], 0, part.anchor ?? [0, 0, 0]))
  }

  function dispose() {
    for (const m of materials.values()) m.dispose()
    materials.clear()
  }

  return { material, sailMaterial, mesh, buildShip, buildPart, dispose, meshUrl }
}

// ── Inner glow and gleam ─────────────────────────────────────────────

export type GlowState = { spec: Glow, mats: THREE.MeshStandardMaterial[], lights: THREE.PointLight[] }

/**
 * The Shadow Fleet's glow lives in its own filament: every material of the
 * hull's palette colour gets an emissive tint, and point lights inside the
 * hull spill it onto whatever faces them (deck, sails, the sea around it).
 * The Treasure Fleet's gleam is switched on the same way. `withLights:
 * false` skips the point lights (a table full of ships cannot afford them).
 */
export function setupGlow(ship: Ship, group: THREE.Object3D, withLights = true): GlowState | null {
  group.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined
    if (!m?.userData?.gleam) return
    const on = !!ship.gleam && m.userData.paletteKey === ship.hull.color
    m.userData.gleam.value = on ? ship.gleam!.strength : 0
    if (on) m.userData.gleamColor.value.set(ship.gleam!.color)
  })
  if (!ship.glow) return null
  const color = new THREE.Color(ship.glow.color)
  const mats = new Set<THREE.MeshStandardMaterial>()
  group.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined
    if (m && m.userData?.paletteKey === ship.hull.color) mats.add(m)
  })
  for (const m of mats) m.emissive.copy(color)
  const lights = withLights
    ? ship.glow.lights.map((at) => {
      const l = new THREE.PointLight(color, 0, 0, 2)
      l.position.set(at[0], at[1], at[2])
      group.add(l)
      return l
    })
    : []
  return { spec: ship.glow, mats: [...mats], lights }
}

export function animateGlow(glow: GlowState | null, t: number) {
  if (!glow) return
  // Only ever slow: a breath every few seconds, with each light drifting a
  // little out of step with the others. Nothing flickers.
  const k = 0.78 + 0.22 * Math.sin(t * 0.9) + 0.06 * Math.sin(t * 0.37 + 1.3)
  for (const m of glow.mats) m.emissiveIntensity = glow.spec.emissive * k
  glow.lights.forEach((l, i) => { l.intensity = glow.spec.intensity * k * (0.88 + 0.12 * Math.sin(t * 0.6 + i * 2.1)) })
}
