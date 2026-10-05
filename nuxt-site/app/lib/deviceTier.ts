// A first guess at what the device's GPU can do, before any frame is timed,
// shared by the web game (lib/game3d.ts, whose graphics levels these are)
// and the shop's 3D preview (components/ShipPreview.client.vue).
//
//   0  software rendering (no real GPU)
//   1  a weak phone or tablet
//   2  a mid-range phone, or a desktop with few cores or little memory
//   3  a good phone, or a desktop on integrated graphics
//   4  a desktop with a discrete GPU
import type * as THREE from 'three'

export function detectLevel(renderer: THREE.WebGLRenderer): number {
  const nav = navigator as Navigator & { deviceMemory?: number }
  const mem = nav.deviceMemory ?? 8
  const cores = nav.hardwareConcurrency ?? 4
  const coarse = isCoarse()
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

/** A touch screen as the main pointer: a phone or tablet. */
export function isCoarse(): boolean {
  return !!window.matchMedia?.('(pointer: coarse)').matches
}
