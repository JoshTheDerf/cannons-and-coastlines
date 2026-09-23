// The world around a ship in the 3D preview: sky, sea, weather, lighting and
// the islands on the horizon.
//
// Every look is an "atmosphere" from shared/data/ship-assemblies.json
// (`scene.atmospheres`); a ship picks one, and apply() swaps the whole world
// over to it. All distances are millimetres, like the models, and the world
// is three.js Y-up (the ship group is rotated from hull Z-up into it).
//
// Nothing here knows about ships. ShipPreview.client.vue owns the renderer,
// camera and post-processing, and calls:
//   createSea(renderer, scene, waterLevel)
//   sea.apply(atmosphere)      when the ship (and so the weather) changes
//   sea.update(seconds, focus) every frame, before rendering
//   sea.renderOverlay(camera)  after the composer, for rain
import * as THREE from 'three'

export type Atmosphere = {
  sky: { zenith: string, horizon: string, glow: string }
  sun: { dir: [number, number, number], color: string, intensity: number }
  hemi: { sky: string, ground: string, intensity: number }
  env: number
  exposure: number
  fog: { color: string, near: number, far: number }
  clouds: { cover: number, color: string, shadow: string, speed: number }
  sea: { deep: string, shallow: string, roughness: number, chop: number, swell: number, foam: number, speed: number }
  rain: number
  lightning: number
  islands: { color: string, beach: string | null, palms: boolean }
}

const SKY_RADIUS = 15000
const SEA_RADIUS = 14000
const NEAR_RADIUS = 1180

// Value noise shared by the sky and the sea shaders.
const NOISE_GLSL = `
  float seaHash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float seaNoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(seaHash(i), seaHash(i + vec2(1.0, 0.0)), u.x),
               mix(seaHash(i + vec2(0.0, 1.0)), seaHash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float seaFbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) { v += a * seaNoise(p); p = p * 2.03 + vec2(17.1, 9.2); a *= 0.5; }
    return v;
  }
  float seaFbm3(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 3; i++) { v += a * seaNoise(p); p = p * 2.03 + vec2(17.1, 9.2); a *= 0.5; }
    return v / 0.875;
  }
  // Pure sine trains line up into a lattice toward the horizon. Warping the
  // sea's coordinates with slow noise bends every wave front a little, and a
  // second field varies how strong the waves are from patch to patch.
  vec2 seaWarp(vec2 p) {
    return p + 160.0 * (vec2(seaFbm3(p * 0.0021), seaFbm3(p * 0.0021 + 7.3)) - 0.5);
  }
  float seaPatchAmp(vec2 p) {
    return 0.45 + 1.1 * seaFbm3(p * 0.0017 + 3.1);
  }
`

// The swell: four long wave trains, shared by the vertex displacement and
// the fragment normal so the lighting matches the shape. Heights sum to
// about +-1 before scaling by the atmosphere's swell (mm).
const SWELL_GLSL = `
  const vec4 SW_A = vec4(1.0, 0.6, 0.35, 0.8);      // amplitudes
  const vec4 SW_L = vec4(140.0, 90.0, 55.0, 210.0); // wavelengths, mm
  const vec4 SW_S = vec4(1.0, 1.3, 1.7, 0.8);       // speeds
  const float SW_NORM = 1.0 / 2.75;
  vec2 swDir(int i) {
    if (i == 0) return normalize(vec2(1.0, 0.3));
    if (i == 1) return normalize(vec2(-0.5, 1.0));
    if (i == 2) return normalize(vec2(0.3, -1.0));
    return normalize(vec2(-1.0, -0.2));
  }
  // x: height, yz: gradient
  vec3 swell(vec2 p, float t) {
    vec3 r = vec3(0.0);
    for (int i = 0; i < 4; i++) {
      vec2 d = swDir(i);
      float k = 6.2831853 / SW_L[i];
      float ph = dot(d, p) * k + t * SW_S[i];
      r.x += SW_A[i] * sin(ph);
      r.yz += d * (SW_A[i] * k * cos(ph));
    }
    return r * SW_NORM;
  }
`

function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed)
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t
    return ((t ^ t >>> 14) >>> 0) / 4294967296
  }
}

export function createSea(renderer: THREE.WebGLRenderer, scene: THREE.Scene, waterLevel: number) {
  // ── Sky ─────────────────────────────────────────────────────────────
  const skyUniforms = {
    uZenith: { value: new THREE.Color() },
    uHorizon: { value: new THREE.Color() },
    uGlow: { value: new THREE.Color() },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uCloudCover: { value: 0 },
    uCloudColor: { value: new THREE.Color() },
    uCloudShadow: { value: new THREE.Color() },
    uCloudSpeed: { value: 0 },
    uTime: { value: 0 },
    uFlash: { value: 0 }
  }
  const skyMaterial = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: skyUniforms,
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 uZenith, uHorizon, uGlow, uCloudColor, uCloudShadow, uSunDir;
      uniform float uCloudCover, uCloudSpeed, uTime, uFlash;
      varying vec3 vDir;
      ${NOISE_GLSL}
      void main() {
        vec3 d = normalize(vDir);
        float h = max(d.y, 0.0);
        vec3 col = mix(uHorizon, uZenith, pow(h, 0.5));
        float sd = max(dot(d, normalize(uSunDir)), 0.0);
        col += uGlow * (pow(sd, 6.0) * 0.3 + pow(sd, 300.0) * 2.0 * (1.0 - uCloudCover * 0.85));
        float cov = 0.0;
        if (d.y > 0.0) {
          // Clouds on a flat layer overhead, drifting.
          vec2 uv = d.xz / (d.y + 0.12) * 1.6 + vec2(1.0, 0.4) * uTime * uCloudSpeed;
          float n = seaFbm(uv);
          float n2 = seaFbm(uv * 2.3 + 5.0);
          cov = smoothstep(1.0 - uCloudCover - 0.1, 1.0 - uCloudCover + 0.35, n * 0.75 + n2 * 0.35);
          vec2 toSun = normalize(uSunDir.xz + 1e-4);
          float lit = clamp(0.55 + 0.45 * dot(normalize(d.xz + 1e-4), toSun), 0.0, 1.0);
          vec3 cc = mix(uCloudShadow, uCloudColor, clamp(n2 * 1.3 * lit + 0.15, 0.0, 1.0));
          col = mix(col, cc, cov * smoothstep(0.0, 0.12, d.y));
        }
        col += uFlash * vec3(0.75, 0.8, 1.0) * (0.35 + 0.65 * cov);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  })
  const sky = new THREE.Mesh(new THREE.SphereGeometry(SKY_RADIUS, 48, 24), skyMaterial)
  scene.add(sky)

  // ── Sea ─────────────────────────────────────────────────────────────
  const seaUniforms = {
    uTime: { value: 0 },
    uSwell: { value: 0 },
    uChop: { value: 1 },
    uFoam: { value: 0 },
    uDeep: { value: new THREE.Color() },
    uShallow: { value: new THREE.Color() }
  }
  // Two sheets: a dense grid near the ship that really heaves, and a flat
  // disc beyond it out to the horizon. The grid's swell fades to nothing at
  // its edge and near the ship (so waves never cut through the hull), so
  // the join is invisible.
  function seaMaterial(heaves: boolean) {
    const mat = new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.2, metalness: 0, specularIntensity: 0.6 })
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, seaUniforms)
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
          uniform float uTime, uSwell;
          varying vec3 vSeaPos;
          varying float vSeaH;
          varying float vSeaAtten;
          ${NOISE_GLSL}
          ${SWELL_GLSL}`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          {
            // The sheet lies in its local XY; world XZ is (x, -y).
            vec2 p = vec2(position.x, -position.y);
            float r = length(p);
            float atten = ${heaves ? 'smoothstep(95.0, 190.0, r) * (1.0 - smoothstep(850.0, 1170.0, r))' : '0.0'};
            vec3 s = swell(seaWarp(p), uTime) * seaPatchAmp(p);
            transformed.z += s.x * uSwell * atten;
            vSeaH = s.x;
            vSeaAtten = atten;
          }`)
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvSeaPos = (modelMatrix * vec4(transformed, 1.0)).xyz;')
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          uniform float uTime, uSwell, uChop, uFoam;
          uniform vec3 uDeep, uShallow;
          varying vec3 vSeaPos;
          varying float vSeaH;
          varying float vSeaAtten;
          ${NOISE_GLSL}
          ${SWELL_GLSL}
          vec2 chopWave(vec2 p, vec2 dir, float len, float amp, float speed) {
            float k = 6.2831853 / len;
            return dir * (amp * k * cos(dot(dir, p) * k + uTime * speed));
          }`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          vec2 seaP = vSeaPos.xz;
          // Sea millimetres per pixel here: how far away this bit of water is.
          float seaPx = length(fwidth(seaP));
          float seaDist = length(vSeaPos.xz - cameraPosition.xz);
          float seaNear = 1.0 - smoothstep(500.0, 3000.0, seaDist);
          // Crests catch the light and look greener; troughs stay deep.
          float seaCrest = clamp(vSeaH * 0.5 + 0.5, 0.0, 1.0);
          float seaPatch = seaFbm(seaP * 0.004 + uTime * 0.01);
          diffuseColor.rgb = mix(uDeep, uShallow, clamp(seaCrest * 0.55 * (vSeaAtten * 0.7 + 0.3) + seaPatch * 0.35, 0.0, 1.0));
          // Whitecaps: streaks on the highest crests where the swell runs,
          // torn up by fine noise so they read as spray, not blotches.
          vec2 seaFoamP = seaP * vec2(0.16, 0.07) + vec2(uTime * 0.09, -uTime * 0.05);
          float seaFoamN = seaFbm(seaFoamP) * 0.6 + seaFbm(seaP * 0.45 + uTime * 0.2) * 0.4;
          float seaFoam = uFoam * vSeaAtten * seaNear
            * smoothstep(0.66, 0.86, seaCrest) * smoothstep(0.48, 0.72, seaFoamN);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.92, 0.95, 0.96), seaFoam);`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
          // Gusts: patches of calmer and rougher water, drifting slowly, so
          // highlights break up into patches instead of running in rows.
          float seaGust = seaFbm3(seaP * 0.0045 + vec2(uTime * 0.012, uTime * 0.007));
          roughnessFactor *= 0.55 + 1.0 * seaGust;
          // Far away, many wavelets share one pixel: blur the glints together.
          roughnessFactor += 0.28 * smoothstep(3.0, 30.0, seaPx);
          roughnessFactor = clamp(mix(roughnessFactor, 0.9, seaFoam), 0.04, 1.0);`)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
          {
            vec2 wp = seaWarp(seaP);
            float amp = seaPatchAmp(seaP);
            vec3 s = swell(wp, uTime) * uSwell * vSeaAtten * amp;
            vec2 g = s.yz;
            // Wind chop on top of the swell (on warped coordinates too, with
            // its own patchiness), then fine ripples from noise.
            float chopAmp = uChop * (0.4 + 1.2 * seaFbm3(seaP * 0.004 + 11.0));
            g += chopAmp * (chopWave(wp, normalize(vec2(1.0, 0.35)), 38.0, 0.35, 1.1)
                          + chopWave(wp, normalize(vec2(-0.6, 1.0)), 23.0, 0.2, 1.6)
                          + chopWave(wp, normalize(vec2(0.2, -1.0)), 13.0, 0.08, 2.3)
                          + chopWave(wp, normalize(vec2(0.7, 0.9)), 17.0, 0.1, 1.9));
            // Fine ripples only while they are bigger than a pixel; any
            // smaller and they alias into exactly the grid we are avoiding.
            float px = seaPx;
            float rippleVis = 1.0 - smoothstep(2.0, 6.0, px);
            float e = 0.9;
            vec2 q = seaP * 0.09 + vec2(uTime * 0.12, uTime * 0.05);
            float r0 = seaFbm(q);
            g += rippleVis * uChop * 0.9 * vec2(seaFbm(q + vec2(e * 0.09, 0.0)) - r0, seaFbm(q + vec2(0.0, e * 0.09)) - r0) / e;
            // Short chop fades the same way as it shrinks toward the horizon.
            g *= mix(0.3, 1.0, 1.0 - smoothstep(8.0, 30.0, px)) * mix(0.25, 1.0, seaNear);
            vec3 nW = normalize(vec3(-g.x, 1.0, -g.y));
            normal = normalize((viewMatrix * vec4(nW, 0.0)).xyz);
          }`)
    }
    mat.customProgramCacheKey = () => `cnc-sea-${heaves ? 1 : 0}`
    return mat
  }
  // Concentric rings rather than a square grid, so the heaving sheet meets
  // the flat one on a circle with no overlap to z-fight.
  const nearSea = new THREE.Mesh(new THREE.RingGeometry(0.5, NEAR_RADIUS, 256, 150), seaMaterial(true))
  nearSea.rotation.x = -Math.PI / 2
  nearSea.position.y = waterLevel
  const farGeom = new THREE.RingGeometry(NEAR_RADIUS, SEA_RADIUS, 256, 1)
  const farSea = new THREE.Mesh(farGeom, seaMaterial(false))
  farSea.rotation.x = -Math.PI / 2
  farSea.position.y = waterLevel
  scene.add(nearSea, farSea)
  const seaMats = [nearSea.material as THREE.MeshPhysicalMaterial, farSea.material as THREE.MeshPhysicalMaterial]

  // ── Lights ──────────────────────────────────────────────────────────
  const hemi = new THREE.HemisphereLight()
  const sun = new THREE.DirectionalLight()
  const fill = new THREE.DirectionalLight(0xdfe8f2, 0.5)
  fill.position.set(5, 3, 4)
  const bolt = new THREE.DirectionalLight(0xdfe8ff, 0)
  scene.add(hemi, sun, fill, bolt)

  // ── Distant islands ─────────────────────────────────────────────────
  let islands: THREE.Group | null = null
  function buildIslands(atm: Atmosphere) {
    if (islands) {
      scene.remove(islands)
      islands.traverse((o) => { if ((o as THREE.Mesh).isMesh) { (o as THREE.Mesh).geometry.dispose() } })
    }
    islands = new THREE.Group()
    const rand = mulberry32(7)
    const land = new THREE.MeshStandardMaterial({ color: atm.islands.color, roughness: 0.95, flatShading: true })
    const beach = atm.islands.beach ? new THREE.MeshStandardMaterial({ color: atm.islands.beach, roughness: 1 }) : null
    const trunk = new THREE.MeshStandardMaterial({ color: '#7a5a3a', roughness: 1 })
    const frond = new THREE.MeshStandardMaterial({ color: '#2f7d3a', roughness: 0.9, flatShading: true })
    // Spread them round the horizon, inside the fog's reach so they read as
    // silhouettes in clear weather and ghosts in bad.
    const count = 9
    for (let i = 0; i < count; i++) {
      const ang = (i / count) * Math.PI * 2 + rand() * 0.5
      const dist = atm.fog.far * (0.45 + rand() * 0.4)
      const r = 220 + rand() * 520
      const h = 70 + rand() * 260
      const geom = new THREE.IcosahedronGeometry(1, 4)
      const pos = geom.getAttribute('position') as THREE.BufferAttribute
      const seed = rand() * 100
      for (let v = 0; v < pos.count; v++) {
        const x = pos.getX(v), y = pos.getY(v), z = pos.getZ(v)
        const n = 1 + 0.28 * Math.sin(x * 3.1 + seed) * Math.cos(z * 2.7 + seed * 1.3) + 0.12 * Math.sin((x + z) * 7.3 + seed)
        pos.setXYZ(v, x * r * n, Math.max(y, -0.05) * h * n, z * r * 0.75 * n)
      }
      geom.computeVertexNormals()
      const isle = new THREE.Mesh(geom, land)
      const cx = Math.cos(ang) * dist, cz = Math.sin(ang) * dist
      isle.position.set(cx, waterLevel, cz)
      isle.rotation.y = rand() * Math.PI
      islands.add(isle)
      if (beach) {
        const sand = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.12, r * 1.18, 6, 32), beach)
        sand.scale.z = 0.8
        sand.position.set(cx, waterLevel + 1, cz)
        sand.rotation.y = isle.rotation.y
        islands.add(sand)
      }
      if (atm.islands.palms) {
        const palms = 4 + Math.floor(rand() * 6)
        for (let k = 0; k < palms; k++) {
          const a = rand() * Math.PI * 2
          const rr = r * (0.55 + rand() * 0.45)
          const px = cx + Math.cos(a) * rr, pz = cz + Math.sin(a) * rr * 0.75
          const tall = 60 + rand() * 50
          const t = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 4, tall, 5), trunk)
          t.position.set(px, waterLevel + tall / 2 + 4, pz)
          t.rotation.z = (rand() - 0.5) * 0.4
          islands.add(t)
          for (let f = 0; f < 6; f++) {
            const leaf = new THREE.Mesh(new THREE.ConeGeometry(6, 40, 4), frond)
            leaf.position.set(px, waterLevel + tall + 4, pz)
            leaf.rotation.set(Math.PI / 2 - 0.5, (f / 6) * Math.PI * 2, 0, 'YXZ')
            leaf.translateY(18)
            islands.add(leaf)
          }
        }
      }
    }
    scene.add(islands)
  }

  // ── Rain: streaks drawn over the finished frame ─────────────────────
  const overlay = new THREE.Scene()
  const DROPS = 2200
  const RAIN_BOX = new THREE.Vector3(900, 600, 900)
  const rainPos = new Float32Array(DROPS * 6)
  const drops = new Float32Array(DROPS * 3)
  const rng = mulberry32(11)
  for (let i = 0; i < DROPS; i++) {
    drops[i * 3] = (rng() - 0.5) * RAIN_BOX.x
    drops[i * 3 + 1] = rng() * RAIN_BOX.y
    drops[i * 3 + 2] = (rng() - 0.5) * RAIN_BOX.z
  }
  const rainGeom = new THREE.BufferGeometry()
  rainGeom.setAttribute('position', new THREE.BufferAttribute(rainPos, 3))
  const rainMat = new THREE.LineBasicMaterial({ color: '#d4dbe0', transparent: true, opacity: 0, depthTest: false, fog: false })
  const rain = new THREE.LineSegments(rainGeom, rainMat)
  rain.frustumCulled = false
  overlay.add(rain)

  // ── Lightning ───────────────────────────────────────────────────────
  let current: Atmosphere | null = null
  let nextStrike = 3
  let strikeAt = -10

  let envTarget: THREE.WebGLRenderTarget | null = null
  const pmrem = new THREE.PMREMGenerator(renderer)

  function apply(atm: Atmosphere) {
    current = atm
    skyUniforms.uZenith.value.set(atm.sky.zenith)
    skyUniforms.uHorizon.value.set(atm.sky.horizon)
    skyUniforms.uGlow.value.set(atm.sky.glow)
    skyUniforms.uSunDir.value.set(...atm.sun.dir).normalize()
    skyUniforms.uCloudCover.value = atm.clouds.cover
    skyUniforms.uCloudColor.value.set(atm.clouds.color)
    skyUniforms.uCloudShadow.value.set(atm.clouds.shadow)
    skyUniforms.uCloudSpeed.value = atm.clouds.speed

    seaUniforms.uSwell.value = atm.sea.swell
    seaUniforms.uChop.value = atm.sea.chop
    seaUniforms.uFoam.value = atm.sea.foam
    seaUniforms.uDeep.value.set(atm.sea.deep)
    seaUniforms.uShallow.value.set(atm.sea.shallow)
    for (const m of seaMats) m.roughness = atm.sea.roughness

    hemi.color.set(atm.hemi.sky)
    hemi.groundColor.set(atm.hemi.ground)
    hemi.intensity = atm.hemi.intensity
    sun.color.set(atm.sun.color)
    sun.intensity = atm.sun.intensity
    sun.position.set(...atm.sun.dir).multiplyScalar(1000)
    fill.intensity = 0.25 + atm.hemi.intensity * 0.25

    scene.fog = new THREE.Fog(atm.fog.color, atm.fog.near, atm.fog.far)
    renderer.toneMappingExposure = atm.exposure
    rainMat.opacity = 0.32 * atm.rain

    // Reflections come from this sky: re-render it into an environment map.
    const envScene = new THREE.Scene()
    envScene.add(new THREE.Mesh(sky.geometry, skyMaterial))
    envTarget?.dispose()
    envTarget = pmrem.fromScene(envScene, 0.02)
    scene.environment = envTarget.texture
    scene.environmentIntensity = atm.env

    buildIslands(atm)
    nextStrike = 2 + Math.random() * 4
  }

  const focus = new THREE.Vector3()
  let last = 0
  function update(t: number, target: THREE.Vector3) {
    const dt = Math.min(0.1, t - last)
    last = t
    skyUniforms.uTime.value = t
    seaUniforms.uTime.value = t * (current?.sea.speed ?? 1)
    focus.copy(target)

    // Rain falls through a box that follows the camera's focus.
    if (current && current.rain > 0) {
      const fall = 900 * dt
      for (let i = 0; i < DROPS; i++) {
        let y = drops[i * 3 + 1]! - fall
        if (y < 0) y += RAIN_BOX.y
        drops[i * 3 + 1] = y
        const x = focus.x + drops[i * 3]!, z = focus.z + drops[i * 3 + 2]!
        const yy = waterLevel + y
        rainPos.set([x, yy, z, x + 1.5, yy + 14, z + 0.5], i * 6)
      }
      rainGeom.attributes.position!.needsUpdate = true
    }

    // Lightning: a bright double flicker every few seconds, lighting the
    // clouds from inside and the fleet from above.
    let flash = 0
    if (current && current.lightning > 0) {
      if (t > nextStrike) {
        strikeAt = t
        nextStrike = t + 3 + Math.random() * 7
        bolt.position.set((Math.random() - 0.5) * 2, 1.2, (Math.random() - 0.5) * 2)
      }
      const s = t - strikeAt
      if (s >= 0 && s < 0.8) flash = Math.exp(-s * 10) + (s > 0.14 ? 0.7 * Math.exp(-(s - 0.14) * 9) : 0)
      flash *= current.lightning
    }
    skyUniforms.uFlash.value = flash
    bolt.intensity = flash * 5
  }

  function renderOverlay(camera: THREE.Camera) {
    if (!current || current.rain <= 0) return
    const auto = renderer.autoClear
    renderer.autoClear = false
    renderer.render(overlay, camera)
    renderer.autoClear = auto
  }

  function dispose() {
    envTarget?.dispose()
    pmrem.dispose()
    sky.geometry.dispose()
    skyMaterial.dispose()
    nearSea.geometry.dispose()
    farSea.geometry.dispose()
    for (const m of seaMats) m.dispose()
    rainGeom.dispose()
    rainMat.dispose()
  }

  return { apply, update, renderOverlay, dispose }
}
