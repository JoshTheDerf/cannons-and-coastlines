// The web game's table in 3D (public/game/, bundled to public/game/game3d.js
// by scripts/build-game3d.mjs).
//
// The game itself (rules, AI, online play, the on-table controls) stays in
// the plain scripts under public/game/. This module only draws: every frame
// public/game/view3d.js hands it plain descriptions of the ships and terrain
// in table centimetres, and it poses the real ship models from
// shared/data/ship-assemblies.json (via lib/shipAssembly.ts, the same code
// as the shop's 3D preview) on the sea from lib/seaScene.ts. It also owns
// the camera, and projects between the table and the screen so the 2D
// overlay (chips, lanes, rings) lines up with the 3D view.
//
// Units: the scene is in millimetres, three.js Y up. Table point (x, y) in
// cm is scene (10x, 0, 10y), so the screen's "up the table" is -Z, as in the
// old top-down view. The water surface is y = 0.
import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { createSea } from './seaScene'
import { data, createAssemblyKit, filamentTime, setupGlow, animateGlow, placeMatrix, loadGeometry, withPrintUp, type ShipRig, type GlowState, type Socket } from './shipAssembly'

const MM = 10
// Hull space has the water at z = waterLevel; the scene has it at y = 0.
const WATER = data.scene.waterLevel

// Game faction ids to ship-assemblies.json keys.
const SHIP_KEY: Record<string, string> = {
  queens_fleet: 'queens-fleet', corsairs: 'corsairs', treasure_fleet: 'treasure-fleet', stone_fleet: 'stone-fleet',
  shadow_fleet: 'shadow-fleet', industry: 'industry', islanders: 'islanders', sun_fleet: 'stone-fleet'
}

// ── What view3d.js sends each frame ──────────────────────────────────

export type ShipDesc = {
  id: string
  faction: string
  x: number, y: number, h: number
  /** Which masts / cargo are aboard, bow to stern. */
  masts: boolean[]
  cargo: boolean[]
  turret: boolean
  stack: boolean
  /** Turret facing relative to the bow, clockwise radians. */
  turretRel: number
  dead: boolean
  braced: boolean
  /** Owner's colour, and how strongly to ring the hull (0 hides the ring). */
  color: string
  ring: number
  /** The slot the ship's one gun sits in: direction relative to the bow (clockwise radians) and position (cm, lx starboard, ly bow). */
  gun: { dir: number, lx: number, ly: number } | null
}
export type TerrainDesc = { id: number, type: 'island' | 'rock' | 'reef', x: number, y: number, r: number, owner: string | null }
export type Table = { shape: 'rect', w: number, h: number } | { shape: 'circle', r: number }
export type CamState = { tx: number, ty: number, dist: number, yaw: number, pitch: number }

// ── Hull space to scene ──────────────────────────────────────────────
// Hull: bow -X, starboard +Y, up +Z (mm). Scene, for a ship heading "up the
// table": bow -Z, starboard +X, up +Y. That is the cyclic swap
// (x, y, z) -> (y, z, x), a proper rotation.
const HULL_TO_SCENE = new THREE.Matrix4().set(
  0, 1, 0, 0,
  0, 0, 1, 0,
  1, 0, 0, 0,
  0, 0, 0, 1
)

type Template = {
  rig: ShipRig
  group: THREE.Group
  /** Hull centre in hull XY (mm): the ship's table position. */
  cx: number, cy: number
  len: number, wid: number
  sockets: Socket[]
  cannonAnchor: [number, number, number]
  glow: GlowState | null
}

type Instance = {
  root: THREE.Group
  bob: THREE.Group
  roles: Map<string, THREE.Object3D[]>
  turretPivot: THREE.Group | null
  gun: THREE.Mesh | null
  gunKey: string
  ring: THREE.Mesh
  ringMat: THREE.MeshBasicMaterial
  pennants: THREE.Mesh[]
  color: string
  phase: number
  faction: string
  seen: number
}

/** The weather a fleet's scene has in the shop, and every weather there is. */
export function atmosphereOf(faction: string): string {
  return data.ships[SHIP_KEY[faction] ?? faction]?.atmosphere ?? 'fair'
}
export const atmospheres = Object.keys(data.scene.atmospheres)

export function supported(): boolean {
  try {
    const c = document.createElement('canvas')
    return !!(c.getContext('webgl2') || c.getContext('webgl'))
  } catch {
    return false
  }
}

// ── Graphics levels ──────────────────────────────────────────────────
// From a cheap phone to a gaming desktop. Each level trades resolution
// (pixel ratio), ambient occlusion, the Shadow Fleet's see-through PETG
// (an extra render pass) and a 30 fps cap for battery and heat.
type Level = { dpr: number, ao: boolean, glass: boolean, fps: number }
const LEVELS: Level[] = [
  { dpr: 0.75, ao: false, glass: false, fps: 30 },
  { dpr: 1, ao: false, glass: false, fps: 30 },
  { dpr: 1.25, ao: false, glass: false, fps: 0 },
  { dpr: 1.5, ao: false, glass: true, fps: 0 },
  { dpr: 2, ao: true, glass: true, fps: 0 }
]
export const LEVEL_NAMES = ['lowest', 'low', 'medium', 'high', 'highest']
const TOP = LEVELS.length - 1

/** A first guess at what the device can do, before any frame is timed. */
function detectLevel(renderer: THREE.WebGLRenderer): number {
  const nav = navigator as Navigator & { deviceMemory?: number }
  const mem = nav.deviceMemory ?? 8
  const cores = nav.hardwareConcurrency ?? 4
  const coarse = !!window.matchMedia?.('(pointer: coarse)').matches
  const gl = renderer.getContext()
  const ext = gl.getExtension('WEBGL_debug_renderer_info')
  const gpu = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : ''
  if (/swiftshader|llvmpipe|softpipe|software|basic render/i.test(gpu)) return 0
  if (coarse) {
    if (mem <= 3 || cores <= 4) return 1
    if (mem >= 8 || /apple gpu|adreno \(tm\) [78]\d\d|mali-g(7[1-9]|[89]\d|7\d\d)|immortalis|xclipse/i.test(gpu)) return 3
    return 2
  }
  if (cores <= 4 || mem <= 4) return 2
  if (/intel|uhd|iris|mali|adreno|powervr/i.test(gpu)) return 3
  return 4
}

/** quality: 'auto' picks a level and keeps adjusting it to the frame rate; 'high' and 'low' pin it. */
export function create(wrap: HTMLElement, opts: { quality?: 'auto' | 'high' | 'low' } = {}) {
  let mode = opts.quality ?? 'auto'
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.NeutralToneMapping
  const canvas = renderer.domElement
  canvas.className = 'board3d'
  wrap.insertBefore(canvas, wrap.firstChild)

  const detected = detectLevel(renderer)
  let level = mode === 'high' ? TOP : mode === 'low' ? 1 : detected
  // Chosen once, at the start: the sea's mesh density and which ship
  // meshes to load (the shop's full-detail set only on the fastest desktops).
  const startLevel = level
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(38, 1, 5, 60000)
  const sea = createSea(renderer, scene, 0, { nearRadius: 2600, calmRadius: 0, scale: 2.6, swell: 0.35, waveScale: 2.6, foam: 0.6, rain: 0.55,
    detail: startLevel <= 1 ? 0.35 : startLevel === 2 ? 0.6 : 1 })
  const kit = createAssemblyKit({
    meshUrl: startLevel >= TOP ? undefined : (u: string) => u.replace('/assets/previews/', '/assets/previews/game/')
  })

  let composer: EffectComposer | null = null
  let gtao: GTAOPass | null = null
  function buildComposer() {
    composer?.dispose()
    gtao?.dispose()
    composer = null
    gtao = null
    if (!LEVELS[level]!.ao) return
    composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { samples: 4, type: THREE.HalfFloatType }))
    composer.addPass(new RenderPass(scene, camera))
    gtao = new GTAOPass(scene, camera, 800, 600)
    gtao.updateGtaoMaterial({ radius: 5, distanceExponent: 1.4, thickness: 3, scale: 1.1, samples: 12, distanceFallOff: 1, screenSpaceRadius: false })
    gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 })
    // Only solid models cast occlusion: the see-through rings, ghosts and
    // shadows on the water would otherwise come out as black outlines.
    const g = gtao as unknown as { _overrideVisibility: () => void, _visibilityCache: THREE.Object3D[] }
    g._overrideVisibility = () => {
      scene.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.Material | undefined
        const flat = (o as THREE.Points).isPoints || (o as THREE.Line).isLine || (m && !Array.isArray(m) && m.transparent)
        if (flat && o.visible) { o.visible = false; g._visibilityCache.push(o) }
      })
    }
    composer.addPass(gtao)
    composer.addPass(new OutputPass())
  }
  buildComposer()

  let W = 1, H = 1
  function resize(w: number, h: number) {
    W = Math.max(1, w)
    H = Math.max(1, h)
    const L = LEVELS[level]!
    const dpr = L.dpr < 1 ? L.dpr : Math.min(window.devicePixelRatio || 1, L.dpr)
    renderer.setPixelRatio(dpr)
    renderer.setSize(W, H)
    composer?.setPixelRatio(dpr)
    composer?.setSize(W, H)
    camera.aspect = W / H
    camera.updateProjectionMatrix()
  }

  // ── Atmosphere ─────────────────────────────────────────────────────
  let atmosphereKey = ''
  let swellK = 1
  function setAtmosphere(key: string) {
    const atm = data.scene.atmospheres[key] ?? data.scene.atmospheres.fair!
    if (key === atmosphereKey) return
    atmosphereKey = key
    sea.apply(atm)
    // Ships ride the sea: storms roll them more.
    swellK = 0.5 + atm.sea.swell * 0.5
  }

  // ── Table edge ─────────────────────────────────────────────────────
  // The table is open sea, so its edge is a faint line with the water
  // beyond it shaded, like a chart's margin.
  const edgeGroup = new THREE.Group()
  scene.add(edgeGroup)
  let tableKey = ''
  let table: Table | null = null
  function setTable(t: Table) {
    const key = JSON.stringify(t)
    if (key === tableKey) return
    tableKey = key
    table = t
    for (const c of [...edgeGroup.children]) {
      edgeGroup.remove(c)
      const m = c as THREE.Mesh
      m.geometry.dispose()
      ;(m.material as THREE.Material).dispose()
    }
    const outer = new THREE.Shape()
    outer.absarc(0, 0, 40000, 0, Math.PI * 2, false)
    const hole = new THREE.Path()
    const line = new THREE.Shape()
    const lineHole = new THREE.Path()
    const E = 2
    if (t.shape === 'circle') {
      const R = t.r * MM
      hole.absarc(R, R, R, 0, Math.PI * 2, true)
      line.absarc(R, R, R + E, 0, Math.PI * 2, false)
      lineHole.absarc(R, R, R - E, 0, Math.PI * 2, true)
    } else {
      const w = t.w * MM, h = t.h * MM
      hole.moveTo(0, 0); hole.lineTo(0, h); hole.lineTo(w, h); hole.lineTo(w, 0); hole.lineTo(0, 0)
      line.moveTo(-E, -E); line.lineTo(w + E, -E); line.lineTo(w + E, h + E); line.lineTo(-E, h + E); line.lineTo(-E, -E)
      lineHole.moveTo(E, E); lineHole.lineTo(E, h - E); lineHole.lineTo(w - E, h - E); lineHole.lineTo(w - E, E); lineHole.lineTo(E, E)
    }
    outer.holes.push(hole)
    line.holes.push(lineHole)
    // Shapes are drawn in XY; lay them on the water with shape y = scene z.
    const flat = (g: THREE.BufferGeometry, y: number) => g.rotateX(Math.PI / 2).translate(0, y, 0)
    // Just above the tallest wave, so the swell never cuts through them.
    const shade = new THREE.Mesh(flat(new THREE.ShapeGeometry(outer, 96), 2.4),
      new THREE.MeshBasicMaterial({ color: '#06121a', transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide }))
    const rim = new THREE.Mesh(flat(new THREE.ShapeGeometry(line, 128), 2.5),
      new THREE.MeshBasicMaterial({ color: '#f4ecd6', transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide }))
    shade.renderOrder = rim.renderOrder = 1
    edgeGroup.add(shade, rim)
  }

  // See-through filament costs a second render pass; slow levels show it opaque.
  const glassMats = new Map<THREE.MeshPhysicalMaterial, number>()
  function applyGlass() {
    for (const [m, t] of glassMats) m.transmission = LEVELS[level]!.glass ? t : 0
  }

  // ── Ship templates ─────────────────────────────────────────────────
  const templates = new Map<string, Promise<Template>>()
  const ready = new Map<string, Template>()
  let pending = 0

  function template(faction: string): Template | null {
    const key = SHIP_KEY[faction] ?? faction
    if (ready.has(key)) return ready.get(key)!
    if (!templates.has(key) && data.ships[key]) {
      pending++
      const p = kit.buildShip(key).then((rig) => {
        const ship = data.ships[key]!
        tagRoles(rig)
        const hb = new THREE.Box3()
        for (const m of rig.hull) { m.geometry.computeBoundingBox(); hb.union(m.geometry.boundingBox!) }
        const glow = setupGlow(ship, rig.group, false)
        rig.group.traverse((o) => {
          const m = (o as THREE.Mesh).material as THREE.MeshPhysicalMaterial | undefined
          if (m?.isMeshPhysicalMaterial && m.transmission > 0) glassMats.set(m, m.transmission)
        })
        applyGlass()
        const cannonPart = data.parts.cannon!
        const t: Template = {
          rig, group: rig.group,
          cx: (hb.min.x + hb.max.x) / 2, cy: (hb.min.y + hb.max.y) / 2,
          len: hb.max.x - hb.min.x, wid: hb.max.y - hb.min.y,
          sockets: ship.sockets?.cannon ?? [],
          cannonAnchor: (cannonPart.anchor ?? [0, 0, 0]) as [number, number, number],
          glow
        }
        addPennants(t, ship.placements)
        ready.set(key, t)
        return t
      }).catch((err) => {
        console.error('ship model failed', key, err)
        throw err
      }).finally(() => { pending-- })
      templates.set(key, p)
    }
    return null
  }

  function tagRoles(rig: ShipRig) {
    for (const m of rig.hull) m.userData.role = 'hull'
    rig.masts.forEach((mt, j) => {
      mt.mesh.userData.role = `mast:${j}`
      for (const s of mt.sails) s.userData.role = `mast:${j}`
    })
    rig.cargo.forEach((c, j) => { c.mesh.userData.role = `cargo:${j}` })
    for (const m of rig.turret?.meshes ?? []) m.userData.role = 'turret'
    if (rig.stack) rig.stack.userData.role = 'stack'
    rig.cannons.forEach((c, j) => { c.mesh.userData.role = j === 0 ? 'gun' : `cannon:${j}` })
    if (rig.coin) rig.coin.userData.role = 'coin'
    if (rig.wheel) rig.wheel.userData.role = 'wheel'
  }

  // A pennant at every masthead (the Industry's flies from its stack) in the
  // owner's colour, so two fleets of the same faction can be told apart.
  const pennantGeom = (() => {
    const g = new THREE.BufferGeometry()
    // In hull space: from the pole toward the stern (+X), hanging in XZ.
    const L = 17, Hh = 8, seg = 6
    const pos: number[] = []
    const idx: number[] = []
    for (let i = 0; i <= seg; i++) {
      const u = i / seg
      const half = (Hh / 2) * (1 - u)
      pos.push(u * L, 0, half, u * L, 0, -half)
    }
    for (let i = 0; i < seg; i++) {
      const a = i * 2
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
    }
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.setIndex(idx)
    g.computeVertexNormals()
    return g
  })()
  const penMats = new Map<string, THREE.MeshStandardMaterial>()
  function penMat(color: string) {
    if (!penMats.has(color)) penMats.set(color, new THREE.MeshStandardMaterial({ color, roughness: 0.7, side: THREE.DoubleSide }))
    return penMats.get(color)!
  }
  function addPennants(t: Template, placements: { part: string, at?: number[] }[]) {
    const masts = placements.filter(p => p.part.startsWith('mast') && p.at)
      .sort((a, b) => a.at![0]! - b.at![0]!)
    masts.forEach((p, j) => {
      const part = data.parts[p.part]!
      const pen = new THREE.Mesh(pennantGeom, penMat('#ffffff'))
      pen.position.set(p.at![0]!, p.at![1]!, p.at![2]! + (part.height ?? 80) - 5)
      pen.userData.role = `mast:${j}`
      pen.userData.pennant = true
      t.group.add(pen)
    })
    if (t.rig.stack) {
      const bb = t.rig.stack.geometry.boundingBox!
      const pole = new THREE.Mesh(withPrintUp(new THREE.CylinderGeometry(0.8, 0.8, 22, 6).rotateX(Math.PI / 2), [0, 0, 1]), kit.material('wood'))
      const px = (bb.min.x + bb.max.x) / 2, py = (bb.min.y + bb.max.y) / 2
      pole.position.set(px, py, bb.max.z + 9)
      pole.userData.role = 'stack'
      const pen = new THREE.Mesh(pennantGeom, penMat('#ffffff'))
      pen.position.set(px, py, bb.max.z + 16)
      pen.userData.role = 'stack'
      pen.userData.pennant = true
      t.group.add(pole, pen)
    }
  }

  // The hull's ring on the water, in the owner's colour: an ellipse just
  // outside the hull, a constant width all round.
  const ringGeoms = new Map<string, THREE.BufferGeometry>()
  function ringGeom(t: Template) {
    const k = `${t.len}|${t.wid}`
    if (!ringGeoms.has(k)) {
      const a = t.len / 2 + 5, b = t.wid / 2 + 5, w = 1.6, n = 96
      const pos: number[] = []
      const idx: number[] = []
      for (let i = 0; i <= n; i++) {
        const th = (i / n) * Math.PI * 2
        const x = a * Math.cos(th), y = b * Math.sin(th)
        const nx = b * Math.cos(th), ny = a * Math.sin(th), nl = Math.hypot(nx, ny)
        // Hull XY -> scene XZ (x along the keel = scene z).
        pos.push(y - (ny / nl) * w, 0, x - (nx / nl) * w, y + (ny / nl) * w, 0, x + (nx / nl) * w)
      }
      for (let i = 0; i < n; i++) {
        const q = i * 2
        idx.push(q, q + 1, q + 2, q + 1, q + 3, q + 2)
      }
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
      g.setIndex(idx)
      ringGeoms.set(k, g)
    }
    return ringGeoms.get(k)!
  }

  // ── Ship instances ─────────────────────────────────────────────────
  const shipLayer = new THREE.Group()
  scene.add(shipLayer)
  const instances = new Map<string, Instance>()
  let frameNo = 0

  function hullFrame(t: Template) {
    // Hull space -> the ship's own frame: centred on the hull, water at 0.
    const g = new THREE.Group()
    g.matrixAutoUpdate = false
    g.matrix.copy(HULL_TO_SCENE).multiply(new THREE.Matrix4().makeTranslation(-t.cx, -t.cy, -WATER))
    return g
  }

  function instantiate(t: Template, faction: string, ghostMat?: THREE.Material): Instance {
    const root = new THREE.Group()
    const bob = new THREE.Group()
    const frame = hullFrame(t)
    const body = t.group.clone(true)
    frame.add(body)
    bob.add(frame)
    root.add(bob)
    const roles = new Map<string, THREE.Object3D[]>()
    const pennants: THREE.Mesh[] = []
    let gun: THREE.Mesh | null = null
    const turretMeshes: THREE.Object3D[] = []
    body.traverse((o) => {
      const role = o.userData.role as string | undefined
      if (!role) return
      if (!roles.has(role)) roles.set(role, [])
      roles.get(role)!.push(o)
      if (o.userData.pennant) pennants.push(o as THREE.Mesh)
      if (role === 'gun') gun = o as THREE.Mesh
      if (role === 'turret') turretMeshes.push(o)
      if (ghostMat && (o as THREE.Mesh).isMesh) (o as THREE.Mesh).material = ghostMat
    })
    // The turret and the gun on it turn together about the turret's axis.
    let turretPivot: THREE.Group | null = null
    if (t.rig.turret && turretMeshes.length) {
      const [px, py] = t.rig.turret.pivot
      turretPivot = new THREE.Group()
      turretPivot.position.set(px, py, 0)
      const inner = new THREE.Group()
      inner.position.set(-px, -py, 0)
      turretPivot.add(inner)
      for (const m of turretMeshes) inner.add(m)
      body.add(turretPivot)
    }
    const ringMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide })
    const ring = new THREE.Mesh(ringGeom(t), ringMat)
    ring.position.y = 2.2
    ring.renderOrder = 2
    if (!ghostMat) root.add(ring)
    else ring.visible = false
    return { root, bob, roles, turretPivot, gun, gunKey: '', ring, ringMat, pennants, color: '', phase: Math.random() * 100, faction, seen: 0 }
  }

  function setRole(inst: Instance, role: string, on: boolean) {
    for (const o of inst.roles.get(role) ?? []) o.visible = on
  }

  function pose(inst: Instance, x: number, y: number, h: number) {
    inst.root.position.set(x * MM, 0, y * MM)
    inst.root.rotation.set(0, -h, 0)
  }

  // Move the ship's one gun to the socket that best matches the slot it
  // last fired from (or the one being picked).
  function placeGun(inst: Instance, t: Template, gun: ShipDesc['gun']) {
    if (!inst.gun) return
    const key = gun ? `${gun.dir.toFixed(3)}|${gun.lx.toFixed(1)}|${gun.ly.toFixed(1)}` : ''
    if (key === inst.gunKey) return
    inst.gunKey = key
    const socks = t.sockets.filter(s => !s.where?.startsWith('turret'))
    const base = inst.gun.userData.placement as { at: [number, number, number], rotZ?: number }
    if (!gun || !socks.length) {
      inst.gun.matrix.copy(placeMatrix(base.at, base.rotZ ?? 0, t.cannonAnchor))
      return
    }
    // Game: dir 0 = forward, +PI/2 = starboard. Hull rotZ: 180 = forward, 90 = +Y (starboard).
    const want = 180 - THREE.MathUtils.radToDeg(gun.dir)
    const angle = (a: number, b: number) => Math.abs(((a - b) % 360 + 540) % 360 - 180)
    let best = socks[0]!, bestScore = Infinity
    for (const s of socks) {
      const lyHull = -(s.at[0] - t.cx) / MM, lxHull = (s.at[1] - t.cy) / MM
      const score = angle(s.rotZ ?? 0, want) + 4 * Math.hypot(lyHull - gun.ly, lxHull - gun.lx)
      if (score < bestScore) { bestScore = score; best = s }
    }
    // One socket (the Islanders' stern arc): the gun swivels in it.
    const rot = socks.length === 1 ? want : best.rotZ ?? 0
    inst.gun.matrix.copy(placeMatrix(best.at, rot, t.cannonAnchor))
  }

  function applyShip(inst: Instance, t: Template, d: ShipDesc, time: number, ghost = false) {
    pose(inst, d.x, d.y, d.h)
    d.masts.forEach((on, j) => setRole(inst, `mast:${j}`, on))
    d.cargo.forEach((on, j) => setRole(inst, `cargo:${j}`, on))
    setRole(inst, 'turret', d.turret)
    setRole(inst, 'stack', d.stack)
    setRole(inst, 'coin', d.braced)
    if (inst.turretPivot) inst.turretPivot.rotation.z = -d.turretRel
    placeGun(inst, t, d.gun)
    // A gentle ride on the swell; a dead ship lists and settles.
    const ph = inst.phase
    const k = ghost ? 0 : swellK
    inst.bob.position.y = Math.sin(time * 1.3 + ph) * 0.5 * k - (d.dead ? 2.5 : 0)
    inst.bob.rotation.z = Math.sin(time * 0.9 + ph * 1.7) * 0.025 * k + (d.dead ? 0.14 : 0)
    inst.bob.rotation.x = Math.sin(time * 1.1 + ph * 0.6) * 0.012 * k
    if (!ghost) {
      if (inst.color !== d.color) {
        inst.color = d.color
        inst.ringMat.color.set(d.color)
        for (const p of inst.pennants) p.material = penMat(d.color)
      }
      inst.ringMat.opacity = d.ring
      inst.ring.visible = d.ring > 0.01
      for (const p of inst.pennants) p.rotation.z = Math.sin(time * 3 + ph + p.position.x * 0.1) * 0.25
    }
  }

  function syncShips(list: ShipDesc[], time: number) {
    frameNo++
    for (const d of list) {
      const t = template(d.faction)
      if (!t) continue
      let inst = instances.get(d.id)
      if (inst && inst.faction !== d.faction) { shipLayer.remove(inst.root); inst = undefined }
      if (!inst) {
        inst = instantiate(t, d.faction)
        instances.set(d.id, inst)
        shipLayer.add(inst.root)
      }
      inst.seen = frameNo
      applyShip(inst, t, d, time)
    }
    for (const [id, inst] of instances) {
      if (inst.seen !== frameNo && !wrecks.has(id)) {
        shipLayer.remove(inst.root)
        instances.delete(id)
      }
    }
  }

  // ── Ghosts: where a ship would end up ──────────────────────────────
  const ghostMats = new Map<string, THREE.MeshStandardMaterial>()
  function ghostMat(alpha: number) {
    const k = alpha.toFixed(2)
    if (!ghostMats.has(k)) {
      ghostMats.set(k, new THREE.MeshStandardMaterial({ color: '#fbf6e8', emissive: '#6f6a5c', roughness: 0.8, transparent: true, opacity: alpha, depthWrite: false }))
    }
    return ghostMats.get(k)!
  }
  const ghostPool = new Map<string, Instance[]>()
  let ghostUsed = new Map<string, number>()
  function ghost(d: ShipDesc, alpha: number, time: number) {
    const t = template(d.faction)
    if (!t) return
    const a = Math.round(clamp(alpha, 0.15, 0.9) * 20) / 20
    const key = `${d.faction}|${a}`
    const pool = ghostPool.get(key) ?? []
    ghostPool.set(key, pool)
    const n = ghostUsed.get(key) ?? 0
    ghostUsed.set(key, n + 1)
    let inst = pool[n]
    if (!inst) {
      inst = instantiate(t, d.faction, ghostMat(a))
      pool.push(inst)
      shipLayer.add(inst.root)
    }
    inst.root.visible = true
    applyShip(inst, t, d, time, true)
  }

  // ── Wrecks and falling fittings ────────────────────────────────────
  const wrecks = new Map<string, { inst: Instance, seen: number }>()
  function wreck(d: ShipDesc, p: number, tilt: number, time: number) {
    let w = wrecks.get(d.id)
    if (!w) {
      let inst = instances.get(d.id)
      const t = template(d.faction)
      if (!t) return
      if (!inst) {
        inst = instantiate(t, d.faction)
        shipLayer.add(inst.root)
      }
      instances.delete(d.id)
      w = { inst, seen: frameNo }
      wrecks.set(d.id, w)
    }
    w.seen = frameNo
    const t = template(d.faction)!
    applyShip(w.inst, t, d, time)
    // Settle by the stern, roll over and go under.
    const e = p * p
    w.inst.bob.position.y = -e * 60 - 2
    w.inst.bob.rotation.z = 0.14 + tilt * 1.4 * e
    w.inst.bob.rotation.x = -0.35 * e
    w.inst.ring.visible = false
  }

  const falls = new Map<number, { obj: THREE.Group, seen: number, base: THREE.Matrix4 }>()
  function fittingFall(key: number, shipId: string, role: string, dx: number, dy: number, p: number) {
    let f = falls.get(key)
    if (!f) {
      const inst = instances.get(shipId)
      if (!inst) return
      const parts = inst.roles.get(role) ?? []
      if (!parts.length) return
      inst.root.updateMatrixWorld(true)
      const obj = new THREE.Group()
      // Pivot at the fitting's foot on the deck.
      const box = new THREE.Box3()
      for (const o of parts) box.expandByObject(o)
      const foot = new THREE.Vector3((box.min.x + box.max.x) / 2, box.min.y, (box.min.z + box.max.z) / 2)
      obj.position.copy(foot)
      for (const o of parts) {
        const c = o.clone(false)
        c.visible = true
        c.matrixAutoUpdate = false
        c.matrix.copy(o.matrixWorld).premultiply(new THREE.Matrix4().makeTranslation(-foot.x, -foot.y, -foot.z))
        obj.add(c)
      }
      scene.add(obj)
      f = { obj, seen: frameNo, base: new THREE.Matrix4() }
      falls.set(key, f)
    }
    f.seen = frameNo
    // 0-0.35: topple outboard; then drift and sink.
    const fall = Math.min(1, p / 0.35)
    const axis = new THREE.Vector3(dy, 0, -dx).normalize()
    f.obj.quaternion.setFromAxisAngle(axis, fall * fall * Math.PI / 2 * 0.95)
    const drift = p * 18
    f.obj.userData.p0 ??= f.obj.position.clone()
    const p0 = f.obj.userData.p0 as THREE.Vector3
    f.obj.position.set(p0.x + dx * drift, p0.y - Math.max(0, p - 0.45) * 60, p0.z + dy * drift)
  }

  // ── Terrain ────────────────────────────────────────────────────────
  type TerrainTemplate = { mesh: THREE.Mesh, radius: number, top: number }
  const terrainTemplates = new Map<string, Promise<TerrainTemplate>>()
  const terrainReady = new Map<string, TerrainTemplate>()
  const TERRAIN_PART: Record<string, [string, string]> = { island: ['island', 'green'], rock: ['rock1', 'rock'], reef: ['reef', 'reef'] }
  function terrainTemplate(type: string): TerrainTemplate | null {
    if (terrainReady.has(type)) return terrainReady.get(type)!
    if (!terrainTemplates.has(type)) {
      const [part, color] = TERRAIN_PART[type] ?? ['rock1', 'rock']
      pending++
      terrainTemplates.set(type, kit.buildPart(part, color).then((mesh) => {
        const pos = mesh.geometry.getAttribute('position')
        const anchor = data.parts[part]!.anchor ?? [0, 0, 0]
        let radius = 0, top = 0
        for (let i = 0; i < pos.count; i++) {
          const x = pos.getX(i) - anchor[0], y = pos.getY(i) - anchor[1]
          const r = Math.hypot(x, y)
          radius = Math.max(radius, r)
          if (r < 5) top = Math.max(top, pos.getZ(i) - anchor[2])
        }
        const tt = { mesh, radius, top }
        terrainReady.set(type, tt)
        return tt
      }).finally(() => { pending-- }))
    }
    return null
  }
  const terrainLayer = new THREE.Group()
  scene.add(terrainLayer)
  const terrains = new Map<string, { obj: THREE.Group, flag: THREE.Group | null, seen: number, desc: TerrainDesc }>()
  let flagPole: THREE.Mesh | null = null
  loadGeometry(kit.meshUrl(data.parts['mast-short']!.preview), data.parts['mast-short']!.printUp).then((g) => {
    flagPole = new THREE.Mesh(g, kit.material('wood'))
    const a = data.parts['mast-short']!.anchor ?? [0, 0, 0]
    flagPole.matrixAutoUpdate = false
    flagPole.matrix.copy(placeMatrix([0, 0, 0], 0, a as [number, number, number]))
  })
  const flagGeom = (() => {
    const g = new THREE.PlaneGeometry(26, 16, 8, 1)
    g.translate(13, 0, 0)
    g.rotateX(Math.PI / 2)
    return g
  })()

  function terrainObject(d: TerrainDesc, tt: TerrainTemplate, ghostM?: THREE.Material) {
    const obj = new THREE.Group()
    const frame = new THREE.Group()
    frame.matrixAutoUpdate = false
    const s = (d.r * MM) / tt.radius
    frame.matrix.copy(HULL_TO_SCENE).multiply(new THREE.Matrix4().makeScale(s, s, s))
      .multiply(new THREE.Matrix4().makeTranslation(0, 0, -WATER))
    const m = tt.mesh.clone()
    if (ghostM) m.material = ghostM
    frame.add(m)
    obj.add(frame)
    obj.position.set(d.x * MM, 0, d.y * MM)
    obj.rotation.y = ((d.id * 2.39996) % (Math.PI * 2))
    obj.userData.scale = s
    return obj
  }

  function syncTerrain(list: TerrainDesc[], time: number) {
    for (const d of list) {
      const tt = terrainTemplate(d.type)
      if (!tt) continue
      const key = `${d.id}|${d.type}|${d.x.toFixed(2)}|${d.y.toFixed(2)}|${d.r.toFixed(2)}`
      let e = terrains.get(key)
      if (!e) {
        const obj = terrainObject(d, tt)
        terrainLayer.add(obj)
        e = { obj, flag: null, seen: 0, desc: d }
        terrains.set(key, e)
      }
      e.seen = frameNo
      // A held island flies its owner's flag from a short mast on top.
      if (d.type === 'island') {
        if (d.owner && !e.flag && flagPole) {
          const flag = new THREE.Group()
          const s = e.obj.userData.scale as number
          const pole = flagPole.clone()
          const cloth = new THREE.Mesh(flagGeom.clone(), penMat(d.owner))
          cloth.position.set(0, 0, 72)
          const fr = new THREE.Group()
          fr.matrixAutoUpdate = false
          fr.matrix.copy(HULL_TO_SCENE).multiply(new THREE.Matrix4().makeTranslation(0, 0, s * (tt.top - WATER) - 4))
          fr.add(pole, cloth)
          flag.add(fr)
          flag.userData.cloth = cloth
          flag.position.copy(e.obj.position)
          terrainLayer.add(flag)
          e.flag = flag
        }
        if (e.flag) {
          e.flag.visible = !!d.owner
          const cloth = e.flag.userData.cloth as THREE.Mesh
          if (d.owner) cloth.material = penMat(d.owner)
          // Let the flag ripple: bend the cloth along its length.
          const pos = cloth.geometry.getAttribute('position') as THREE.BufferAttribute
          for (let i = 0; i < pos.count; i++) {
            const x = pos.getX(i)
            pos.setY(i, Math.sin(time * 4 - x * 0.25) * x * 0.08)
          }
          pos.needsUpdate = true
          cloth.geometry.computeVertexNormals()
        }
      }
    }
    for (const [key, e] of terrains) {
      if (e.seen !== frameNo) {
        terrainLayer.remove(e.obj)
        if (e.flag) terrainLayer.remove(e.flag)
        terrains.delete(key)
      }
    }
  }

  const ghostTerrains: THREE.Group[] = []
  let ghostTerrainUsed = 0
  const ghostOk = new THREE.MeshStandardMaterial({ color: '#b9f5c8', transparent: true, opacity: 0.55, depthWrite: false })
  const ghostBad = new THREE.MeshStandardMaterial({ color: '#f5b0a4', transparent: true, opacity: 0.55, depthWrite: false })
  function ghostTerrain(d: TerrainDesc, ok: boolean) {
    const tt = terrainTemplate(d.type)
    if (!tt) return
    const obj = terrainObject(d, tt, ok ? ghostOk : ghostBad)
    const old = ghostTerrains[ghostTerrainUsed]
    if (old) terrainLayer.remove(old)
    ghostTerrains[ghostTerrainUsed++] = obj
    terrainLayer.add(obj)
  }

  // ── Cannonballs ────────────────────────────────────────────────────
  // Filament materials read a print-direction attribute; plain geometry needs one too.
  const ballGeom = withPrintUp(new THREE.SphereGeometry(5, 20, 14), [0, 1, 0])
  const ballMat = kit.material('neon-green', false)
  const shadowMat = new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.3, depthWrite: false })
  const shadowGeom = new THREE.CircleGeometry(5.5, 20).rotateX(-Math.PI / 2)
  const balls: { ball: THREE.Mesh, shadow: THREE.Mesh }[] = []
  let ballsUsed = 0
  function ball(x: number, y: number, h: number) {
    let b = balls[ballsUsed]
    if (!b) {
      b = { ball: new THREE.Mesh(ballGeom, ballMat), shadow: new THREE.Mesh(shadowGeom, shadowMat) }
      b.shadow.renderOrder = 3
      scene.add(b.ball, b.shadow)
      balls.push(b)
    }
    ballsUsed++
    b.ball.visible = b.shadow.visible = true
    b.ball.position.set(x * MM, h * MM + 5, y * MM)
    b.shadow.position.set(x * MM, 1, y * MM)
    const k = 1 + h * 0.08
    b.shadow.scale.set(k, 1, k)
    shadowMat.opacity = 0.3 / k
  }

  // ── Camera ─────────────────────────────────────────────────────────
  // Orbits a point on the water. `goal` is where it is heading; it glides
  // there, so focusing a ship or following a shot is always a smooth move.
  const cam: CamState = { tx: 60, ty: 60, dist: 1800, yaw: 0, pitch: 0.95 }
  const goal: CamState = { ...cam }
  const PITCH_MIN = 0.42, PITCH_MAX = 1.52
  let distMin = 140, distMax = 4000
  let follow: (() => { x: number, y: number } | null) | null = null

  function placeCamera(c: CamState) {
    const T = new THREE.Vector3(c.tx * MM, 0, c.ty * MM)
    const cp = Math.cos(c.pitch)
    camera.position.set(T.x + c.dist * cp * Math.sin(c.yaw), c.dist * Math.sin(c.pitch), T.z + c.dist * cp * Math.cos(c.yaw))
    camera.up.set(0, 1, 0)
    camera.lookAt(T)
    camera.near = Math.max(2, c.dist / 60)
    camera.far = 60000
    camera.updateProjectionMatrix()
    camera.updateMatrixWorld(true)
  }

  function clampGoal() {
    goal.pitch = clamp(goal.pitch, PITCH_MIN, PITCH_MAX)
    goal.dist = clamp(goal.dist, distMin, distMax)
    if (table) {
      // Keep the focus far enough inside the edge that the view is mostly
      // table, the more so the further out the camera is.
      const size = table.shape === 'circle' ? table.r : Math.min(table.w, table.h) / 2
      const inset = Math.min(size * 0.5, goal.dist * 0.011)
      if (table.shape === 'circle') {
        const lim = table.r - inset
        const dx = goal.tx - table.r, dy = goal.ty - table.r, d = Math.hypot(dx, dy)
        if (d > lim) { goal.tx = table.r + (dx / d) * lim; goal.ty = table.r + (dy / d) * lim }
      } else {
        goal.tx = clamp(goal.tx, inset, table.w - inset)
        goal.ty = clamp(goal.ty, inset, table.h - inset)
      }
    }
  }

  /** The distance at which the whole table fits the view, for a given yaw and pitch. */
  function overviewDist(yaw: number, pitch: number): number {
    if (!table) return 1800
    const pts: [number, number][] = []
    let cx: number, cy: number
    if (table.shape === 'circle') {
      cx = cy = table.r
      for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2; pts.push([table.r + Math.cos(a) * table.r, table.r + Math.sin(a) * table.r]) }
    } else {
      cx = table.w / 2; cy = table.h / 2
      pts.push([0, 0], [table.w, 0], [table.w, table.h], [0, table.h], [cx, 0], [cx, table.h], [0, cy], [table.w, cy])
    }
    const v = new THREE.Vector3()
    const fits = (dist: number) => {
      placeCamera({ tx: cx, ty: cy, dist, yaw, pitch })
      return pts.every(([x, y]) => {
        v.set(x * MM, 0, y * MM).project(camera)
        return Math.abs(v.x) < 0.94 && Math.abs(v.y) < 0.9 && v.z < 1
      })
    }
    let lo = 200, hi = 20000
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) / 2
      if (fits(mid)) hi = mid; else lo = mid
    }
    placeCamera(cam)
    return hi
  }

  function camOverview(yaw?: number, pitch?: number, snap = false) {
    if (!table) return
    if (yaw !== undefined) goal.yaw = yaw
    if (pitch !== undefined) goal.pitch = pitch
    const c = table.shape === 'circle' ? { x: table.r, y: table.r } : { x: table.w / 2, y: table.h / 2 }
    goal.tx = c.x; goal.ty = c.y
    distMax = overviewDist(goal.yaw, Math.max(goal.pitch, 0.9)) * 1.25
    goal.dist = overviewDist(goal.yaw, goal.pitch)
    clampGoal()
    if (snap) Object.assign(cam, goal)
  }

  function camFocus(x: number, y: number, dist?: number, snap = false) {
    goal.tx = x; goal.ty = y
    if (dist !== undefined) goal.dist = dist
    clampGoal()
    if (snap) Object.assign(cam, goal)
  }

  function updateCamera(dt: number) {
    const f = follow?.()
    if (f) { goal.tx = f.x; goal.ty = f.y; clampGoal() }
    const k = 1 - Math.exp(-dt * 4.5)
    cam.tx += (goal.tx - cam.tx) * k
    cam.ty += (goal.ty - cam.ty) * k
    cam.dist *= Math.pow(goal.dist / cam.dist, k)
    let dy = goal.yaw - cam.yaw
    dy = Math.atan2(Math.sin(dy), Math.cos(dy))
    cam.yaw += dy * k
    cam.pitch += (goal.pitch - cam.pitch) * k
    placeCamera(cam)
  }

  // ── Screen <-> table ───────────────────────────────────────────────
  const pv = new THREE.Vector3()
  /** Table point (cm) at height h (cm) to CSS pixels. `z > 1` means behind the camera. */
  function project(x: number, y: number, h = 0) {
    pv.set(x * MM, h * MM, y * MM).project(camera)
    return { x: (pv.x * 0.5 + 0.5) * W, y: (-pv.y * 0.5 + 0.5) * H, z: pv.z }
  }
  const ray = new THREE.Raycaster()
  const ndc = new THREE.Vector2()
  /** CSS pixels to the table point under them (on the water). */
  function unproject(sx: number, sy: number) {
    ndc.set((sx / W) * 2 - 1, -(sy / H) * 2 + 1)
    ray.setFromCamera(ndc, camera)
    const o = ray.ray.origin, d = ray.ray.direction
    let t: number
    if (d.y < -1e-4) t = -o.y / d.y
    else t = 6000 // above the horizon: somewhere far out along the view
    const hx = o.x + d.x * t, hz = o.z + d.z * t
    return { x: hx / MM, y: hz / MM }
  }
  /** Screen pixels per table cm at the camera's focus. */
  function pxPerCm() {
    const a = project(cam.tx, cam.ty)
    const r = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion)
    const b = project(cam.tx + r.x, cam.ty + r.z)
    return Math.hypot(b.x - a.x, b.y - a.y)
  }

  // ── Frame ──────────────────────────────────────────────────────────
  const t0 = performance.now()
  let lastT = 0
  let lastDraw = 0

  /** At a capped level, whether it is time for the next frame. */
  function frameDue() {
    const fps = LEVELS[level]!.fps
    return !fps || performance.now() - lastDraw >= 1000 / fps - 4
  }

  // Automatic level: time the frames and step down when they are slow.
  // Stepping up is a probe: one level at a time, and a level that proved
  // too slow is never tried again this session, so it cannot see-saw.
  const perf = { samples: [] as number[], changedAt: performance.now(), good: 0, banned: new Set<number>() }
  function setLevel(n: number) {
    n = clamp(n, 0, TOP)
    if (n === level) return
    level = n
    perf.changedAt = performance.now()
    perf.samples.length = 0
    perf.good = 0
    buildComposer()
    applyGlass()
    resize(W, H)
  }
  function timeFrame(now: number) {
    const dt = now - lastDraw
    lastDraw = now
    if (mode !== 'auto' || dt > 250 || document.hidden || pending > 0 || now - perf.changedAt < 2500 || now - t0 < 4000) return
    perf.samples.push(dt)
    if (perf.samples.length < 45) return
    const sorted = perf.samples.slice().sort((a, b) => a - b)
    perf.samples.length = 0
    // Ignore the odd hitch: the middle of the window is what it feels like.
    const typical = sorted[Math.floor(sorted.length * 0.6)]!
    const fps = LEVELS[level]!.fps
    const budget = fps ? 1000 / fps : 1000 / 60
    if (typical > budget * 1.35) {
      perf.banned.add(level)
      setLevel(level - 1)
      return
    }
    const easy = fps ? typical < budget * 1.1 : typical < 18
    perf.good = easy ? perf.good + 1 : 0
    const next = level + 1
    if (perf.good >= 4 && next <= Math.min(TOP, detected + 1) && !perf.banned.has(next)) setLevel(next)
  }

  function beginFrame() {
    ghostUsed = new Map()
    ghostTerrainUsed = 0
    ballsUsed = 0
    timeFrame(performance.now())
    const t = (performance.now() - t0) / 1000
    const dt = Math.min(0.1, t - lastT)
    lastT = t
    updateCamera(dt)
    return t
  }

  function render(t: number) {
    // Hide whatever nobody asked for this frame.
    for (const [key, pool] of ghostPool) {
      const n = ghostUsed.get(key) ?? 0
      pool.forEach((g, i) => { g.root.visible = i < n })
    }
    for (let i = ghostTerrainUsed; i < ghostTerrains.length; i++) terrainLayer.remove(ghostTerrains[i]!)
    ghostTerrains.length = ghostTerrainUsed
    balls.forEach((b, i) => { b.ball.visible = b.shadow.visible = i < ballsUsed })
    for (const [id, w] of wrecks) {
      if (w.seen !== frameNo) { shipLayer.remove(w.inst.root); wrecks.delete(id) }
    }
    for (const [key, f] of falls) {
      if (f.seen !== frameNo) { scene.remove(f.obj); falls.delete(key) }
    }
    for (const tt of ready.values()) animateGlow(tt.glow, t)
    filamentTime.value = t
    sea.update(t, new THREE.Vector3(cam.tx * MM, 0, cam.ty * MM))
    if (composer) composer.render()
    else renderer.render(scene, camera)
    sea.renderOverlay(camera)
  }

  function setQuality(q: 'auto' | 'high' | 'low') {
    mode = q
    perf.banned.clear()
    setLevel(q === 'high' ? TOP : q === 'low' ? 1 : detected)
  }

  function preload(factions: string[]) {
    for (const f of factions) template(f)
    for (const t of ['island', 'rock', 'reef']) terrainTemplate(t)
  }

  return {
    canvas,
    resize, setAtmosphere, setTable, setQuality, preload, frameDue,
    get level() { return level },
    beginFrame, syncShips, syncTerrain, ghost, ghostTerrain, wreck, fittingFall, ball, render,
    project, unproject, pxPerCm,
    cam, goal,
    camOverview, camFocus, clampGoal,
    setFollow(fn: typeof follow) { follow = fn },
    overviewDist,
    loading: () => pending > 0,
    get distMin() { return distMin },
    get distMax() { return distMax }
  }
}

function clamp(v: number, a: number, b: number) { return v < a ? a : v > b ? b : v }

export type View = ReturnType<typeof create>
