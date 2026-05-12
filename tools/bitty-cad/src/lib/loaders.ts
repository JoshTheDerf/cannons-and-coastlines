import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export async function loadFile(file: File): Promise<THREE.BufferGeometry> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  const buf = await file.arrayBuffer();
  let geom: THREE.BufferGeometry;
  if (ext === 'stl') geom = loadSTL(buf);
  else if (ext === 'glb' || ext === 'gltf') geom = await loadGLB(buf);
  else if (ext === 'fbx') geom = loadFBX(buf);
  else throw new Error(`Unsupported extension: ${ext}`);
  centerOnBoundingBox(geom);
  return geom;
}

function centerOnBoundingBox(geom: THREE.BufferGeometry): void {
  geom.computeBoundingBox();
  const bb = geom.boundingBox;
  if (!bb) return;
  const center = new THREE.Vector3();
  bb.getCenter(center);
  geom.translate(-center.x, -center.y, -center.z);
  geom.computeBoundingBox();
  geom.computeBoundingSphere();
}

function loadSTL(buf: ArrayBuffer): THREE.BufferGeometry {
  return new STLLoader().parse(buf);
}

function loadGLB(buf: ArrayBuffer): Promise<THREE.BufferGeometry> {
  return new Promise((resolve, reject) => {
    const loader = new GLTFLoader();
    loader.parse(buf, '', gltf => {
      const geoms: THREE.BufferGeometry[] = [];
      gltf.scene.traverse((obj: THREE.Object3D) => {
        const m = obj as THREE.Mesh;
        if ((m as any).isMesh && m.geometry) {
          const g = m.geometry.clone();
          g.applyMatrix4(m.matrixWorld);
          for (const k of Object.keys(g.attributes)) if (k !== 'position') g.deleteAttribute(k);
          if (!g.index) g.setIndex(makeRange(g.getAttribute('position').count));
          geoms.push(g);
        }
      });
      if (!geoms.length) return reject(new Error('No meshes in GLB'));
      resolve(geoms.length === 1 ? geoms[0] : mergeGeometries(geoms, false)!);
    }, reject);
  });
}

function loadFBX(buf: ArrayBuffer): THREE.BufferGeometry {
  const obj = new FBXLoader().parse(buf, '');
  const geoms: THREE.BufferGeometry[] = [];
  obj.traverse((o: THREE.Object3D) => {
    const m = o as THREE.Mesh;
    if ((m as any).isMesh && m.geometry) {
      const g = m.geometry.clone();
      g.applyMatrix4(m.matrixWorld);
      for (const k of Object.keys(g.attributes)) if (k !== 'position') g.deleteAttribute(k);
      if (!g.index) g.setIndex(makeRange(g.getAttribute('position').count));
      geoms.push(g);
    }
  });
  if (!geoms.length) throw new Error('No meshes in FBX');
  return geoms.length === 1 ? geoms[0] : mergeGeometries(geoms, false)!;
}

function makeRange(n: number): THREE.BufferAttribute {
  const a = new Uint32Array(n);
  for (let i = 0; i < n; i++) a[i] = i;
  return new THREE.BufferAttribute(a, 1);
}
