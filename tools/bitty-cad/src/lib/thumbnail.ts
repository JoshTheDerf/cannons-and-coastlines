import * as THREE from 'three';

let renderer: THREE.WebGLRenderer | null = null;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 5000);
camera.up.set(0, 0, 1);
let lightsAdded = false;
const meshHolder = new THREE.Group();

function ensure(size: number): THREE.WebGLRenderer {
  if (!renderer) {
    const canvas = document.createElement('canvas');
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setClearColor(0x20232a, 1);
  }
  renderer.setSize(size, size, false);
  if (!lightsAdded) {
    scene.add(new THREE.AmbientLight(0xffffff, 0.35));
    const key = new THREE.DirectionalLight(0xffffff, 1.0);
    key.position.set(60, -80, 120);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xb8d4ff, 0.45);
    fill.position.set(-90, 40, 50);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0xffe6b8, 0.35);
    rim.position.set(-30, -100, -60);
    scene.add(rim);
    scene.add(meshHolder);
    lightsAdded = true;
  }
  return renderer;
}

export function renderThumbnail(geoms: THREE.BufferGeometry[], size = 128): string {
  if (!geoms.length) return '';
  const r = ensure(size);

  meshHolder.clear();
  const mat = new THREE.MeshStandardMaterial({
    color: 0x9fc1e8,
    metalness: 0.0,
    roughness: 0.85,
    flatShading: true,
  });
  const edgeMat = new THREE.LineBasicMaterial({ color: 0x0a0d12, linewidth: 1 });

  const overall = new THREE.Box3();
  for (const g of geoms) {
    const m = new THREE.Mesh(g, mat);
    meshHolder.add(m);

    const edges = new THREE.EdgesGeometry(g, 30);
    const lines = new THREE.LineSegments(edges, edgeMat);
    meshHolder.add(lines);

    g.computeBoundingBox();
    if (g.boundingBox) overall.union(g.boundingBox);
  }

  if (overall.isEmpty()) return '';
  const center = new THREE.Vector3();
  overall.getCenter(center);
  const sizeVec = new THREE.Vector3();
  overall.getSize(sizeVec);
  const maxDim = Math.max(sizeVec.x, sizeVec.y, sizeVec.z) || 1;
  const dist = maxDim * 2.2;

  camera.position.set(center.x + dist, center.y - dist * 1.2, center.z + dist * 0.9);
  camera.lookAt(center);
  camera.near = dist / 100;
  camera.far = dist * 100;
  camera.updateProjectionMatrix();

  r.render(scene, camera);
  return r.domElement.toDataURL('image/png');
}
