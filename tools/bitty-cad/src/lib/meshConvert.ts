import * as THREE from 'three';
import { markRaw } from 'vue';
import type { Manifold, ManifoldModule } from 'manifold-3d';

export function manifoldToGeometry(manifold: Manifold): THREE.BufferGeometry {
  const mesh = manifold.getMesh();
  const geom = new THREE.BufferGeometry();
  const stride = mesh.numProp;
  const verts = mesh.vertProperties;
  const n = verts.length / stride;
  const positions = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    positions[i * 3 + 0] = verts[i * stride + 0];
    positions[i * 3 + 1] = verts[i * stride + 1];
    positions[i * 3 + 2] = verts[i * stride + 2];
  }
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geom.setIndex(new THREE.BufferAttribute(mesh.triVerts, 1));
  geom.computeVertexNormals();
  return geom;
}

export interface GeometryToManifoldResult {
  manifold: Manifold | null;
  error: string | null;
}

export function geometryToManifold(
  wasm: ManifoldModule,
  geometry: THREE.BufferGeometry,
): GeometryToManifoldResult {
  const g = geometry.index ? geometry : mergeIndex(geometry);
  const pos = g.getAttribute('position').array as ArrayLike<number>;
  const idx = g.index!.array as ArrayLike<number>;

  const verts = new Float32Array(pos.length);
  for (let i = 0; i < pos.length; i++) verts[i] = pos[i];
  const tris = new Uint32Array(idx.length);
  for (let i = 0; i < idx.length; i++) tris[i] = idx[i];

  const meshData = { numProp: 3, vertProperties: verts, triVerts: tris };

  try {
    const m = new wasm.Mesh(meshData);
    m.merge();
    const manifold = new wasm.Manifold(m);
    const status = manifold.status();
    const ok = status === 0 || status === wasm.Manifold.NoError || status === 'NoError';
    if (!ok) {
      manifold.delete?.();
      return { manifold: null, error: `Manifold status: ${status}` };
    }
    return { manifold: markRaw(manifold), error: null };
  } catch (e: any) {
    return { manifold: null, error: e?.message ?? String(e) };
  }
}

function mergeIndex(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const pos = geometry.getAttribute('position').array;
  const n = pos.length / 3;
  const idx = new Uint32Array(n);
  for (let i = 0; i < n; i++) idx[i] = i;
  const g = geometry.clone();
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  return g;
}
