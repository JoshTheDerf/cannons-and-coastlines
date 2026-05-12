<template>
  <div ref="hostRef" class="viewport" @pointerdown="onPointerDown">
    <div class="hud">
      <span v-if="store.error" class="err">{{ store.error }}</span>
      <span v-else-if="store.building">building…</span>
      <span v-else-if="store.output">{{ store.output.length }} part(s)</span>
    </div>
    <div class="overlay">
      <div ref="gizmoRef" class="gizmo-host" />
      <UButton
        icon="i-lucide-focus"
        size="xs"
        variant="solid"
        color="neutral"
        title="Focus selected"
        @click="focusSelected"
      />
      <UButton
        :icon="isOrtho ? 'i-lucide-square' : 'i-lucide-box'"
        size="xs"
        variant="solid"
        color="neutral"
        :title="isOrtho ? 'Switch to perspective' : 'Switch to orthographic'"
        @click="toggleProjection"
      />
      <UButton
        icon="i-lucide-ghost"
        size="xs"
        :variant="store.showGhosts ? 'solid' : 'outline'"
        color="neutral"
        :title="store.showGhosts ? 'Hide subtracted ghosts' : 'Show subtracted ghosts'"
        @click="store.showGhosts = !store.showGhosts"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from 'vue';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { ViewportGizmo } from 'three-viewport-gizmo';
import { buildGrid } from '../lib/grid';
import { store } from '../store';
import { manifoldToGeometry } from '../lib/meshConvert';

const hostRef = ref<HTMLDivElement | null>(null);
const gizmoRef = ref<HTMLDivElement | null>(null);
const isOrtho = ref(false);

let renderer!: THREE.WebGLRenderer;
let scene!: THREE.Scene;
let perspCam!: THREE.PerspectiveCamera;
let orthoCam: THREE.OrthographicCamera | null = null;
let camera!: THREE.PerspectiveCamera | THREE.OrthographicCamera;
let controls!: OrbitControls;
let transform!: TransformControls;
let gizmo: ViewportGizmo | null = null;
let grid: THREE.Object3D | null = null;

const resultGroup = new THREE.Group();
const ghostGroup = new THREE.Group();
const assetGroup = new THREE.Group();
const anchorGroup = new THREE.Group();
const anchorMeshes = new Map<string, THREE.Object3D>();
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let snapTargets: THREE.Mesh[] = [];

onMounted(() => {
  const host = hostRef.value!;
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(host.clientWidth, host.clientHeight);
  renderer.setClearColor(0x14151a);
  host.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  perspCam = new THREE.PerspectiveCamera(45, host.clientWidth / host.clientHeight, 0.1, 5000);
  perspCam.up.set(0, 0, 1);
  perspCam.position.set(80, -120, 90);
  perspCam.lookAt(0, 0, 0);
  camera = perspCam;

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;

  grid = buildGrid();
  scene.add(grid);
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

  scene.add(resultGroup);
  scene.add(ghostGroup);
  scene.add(assetGroup);
  scene.add(anchorGroup);

  transform = new TransformControls(camera, renderer.domElement);
  transform.setSize(0.7);
  transform.addEventListener('dragging-changed', (e: any) => { controls.enabled = !e.value; });
  transform.addEventListener('objectChange', () => {
    const obj = transform.object as THREE.Object3D | undefined;
    if (!obj || !obj.userData.anchorId) return;
    const a = store.anchors.find(x => x.id === obj.userData.anchorId);
    if (!a) return;
    let p = obj.position.clone();
    if (store.snapToVertex || store.snapToSurface) {
      const snapped = trySnapToGeometry(p, store.snapToVertex);
      if (snapped) p = snapped;
    } else {
      const s = store.snapStep;
      p.x = Math.round(p.x / s) * s;
      p.y = Math.round(p.y / s) * s;
      p.z = Math.round(p.z / s) * s;
    }
    obj.position.copy(p);
    a.x = p.x; a.y = p.y; a.z = p.z;
  });
  const helper = (transform as any).getHelper?.() ?? transform;
  scene.add(helper);

  gizmo = new ViewportGizmo(camera, renderer, {
    container: gizmoRef.value!,
    placement: 'center-center',
    size: 96,
  });
  gizmo.attachControls(controls);

  window.addEventListener('resize', onResize);
  animate();
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize);
  renderer?.dispose();
  gizmo?.dispose?.();
});

function onResize(): void {
  const host = hostRef.value; if (!host) return;
  const aspect = host.clientWidth / host.clientHeight;
  perspCam.aspect = aspect;
  perspCam.updateProjectionMatrix();
  if (orthoCam) {
    fitOrthoFrustum(orthoCam, aspect);
    orthoCam.updateProjectionMatrix();
  }
  renderer.setSize(host.clientWidth, host.clientHeight);
  gizmo?.update();
}

function animate(): void {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
  gizmo?.render();
}

// ---- Camera controls -------------------------------------------------------

function fitOrthoFrustum(cam: THREE.OrthographicCamera, aspect: number): void {
  const dist = cam.position.distanceTo(controls.target);
  const viewH = 2 * Math.tan((perspCam.fov * Math.PI) / 360) * dist;
  cam.left = -viewH * aspect / 2;
  cam.right = viewH * aspect / 2;
  cam.top = viewH / 2;
  cam.bottom = -viewH / 2;
  cam.near = -5000;
  cam.far = 5000;
}

function toggleProjection(): void {
  const host = hostRef.value!;
  const aspect = host.clientWidth / host.clientHeight;
  const target = controls.target.clone();
  const pos = camera.position.clone();
  const up = camera.up.clone();

  if (camera === perspCam) {
    if (!orthoCam) orthoCam = new THREE.OrthographicCamera();
    orthoCam.up.copy(up);
    orthoCam.position.copy(pos);
    fitOrthoFrustum(orthoCam, aspect);
    orthoCam.lookAt(target);
    orthoCam.updateProjectionMatrix();
    camera = orthoCam;
    isOrtho.value = true;
  } else {
    perspCam.aspect = aspect;
    perspCam.up.copy(up);
    perspCam.position.copy(pos);
    perspCam.lookAt(target);
    perspCam.updateProjectionMatrix();
    camera = perspCam;
    isOrtho.value = false;
  }

  controls.object = camera;
  controls.target.copy(target);
  controls.update();
  (transform as any).camera = camera;
  if (gizmo) gizmo.camera = camera as THREE.PerspectiveCamera | THREE.OrthographicCamera;
}

function focusSelected(): void {
  const sel = store.selectedAnchorId ? anchorMeshes.get(store.selectedAnchorId) : null;
  if (sel) {
    framePoint(sel.position, 30);
    return;
  }
  // Fall back to fitting the preview/result content.
  const box = new THREE.Box3();
  resultGroup.traverse(o => {
    const m = o as THREE.Mesh;
    if (m.isMesh && m.geometry) {
      m.geometry.computeBoundingBox();
      if (m.geometry.boundingBox) box.union(m.geometry.boundingBox.clone().applyMatrix4(m.matrixWorld));
    }
  });
  if (box.isEmpty()) return;
  const center = new THREE.Vector3();
  box.getCenter(center);
  const size = new THREE.Vector3();
  box.getSize(size);
  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  framePoint(center, maxDim * 1.8);
}

function framePoint(target: THREE.Vector3, distance: number): void {
  const dir = camera.position.clone().sub(controls.target).normalize();
  const newPos = target.clone().add(dir.multiplyScalar(distance));
  camera.position.copy(newPos);
  controls.target.copy(target);
  camera.lookAt(target);
  if (camera === orthoCam) {
    const host = hostRef.value!;
    fitOrthoFrustum(orthoCam!, host.clientWidth / host.clientHeight);
    orthoCam!.updateProjectionMatrix();
  }
  controls.update();
  gizmo?.update();
}

// ---- Anchors ---------------------------------------------------------------

function makeBoxWireframe(): THREE.LineSegments {
  const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));
  const mat = new THREE.LineBasicMaterial({ color: 0x66ccff, transparent: true, opacity: 0.9 });
  const lines = new THREE.LineSegments(edges, mat);
  lines.userData.kind = 'wireframe';
  return lines;
}

function disposeAnchorObj(obj: THREE.Object3D): void {
  obj.traverse(c => {
    const m = c as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
  });
}

function rebuildAnchors(): void {
  for (const [id, obj] of anchorMeshes) {
    if (!store.anchors.find(a => a.id === id)) {
      anchorGroup.remove(obj);
      disposeAnchorObj(obj);
      anchorMeshes.delete(id);
      if (transform.object === obj) transform.detach();
    }
  }
  for (const a of store.anchors) {
    let obj = anchorMeshes.get(a.id);
    if (!obj) {
      const grp = new THREE.Group();
      grp.userData.anchorId = a.id;
      const sphereG = new THREE.SphereGeometry(0.8, 16, 12);
      const color = a.kind === 'box' ? 0x66ccff : 0xffaa33;
      const emissive = a.kind === 'box' ? 0x113344 : 0x442200;
      const sphereM = new THREE.MeshStandardMaterial({ color, emissive });
      const sphere = new THREE.Mesh(sphereG, sphereM);
      sphere.userData.anchorId = a.id;
      grp.add(sphere);
      anchorGroup.add(grp);
      anchorMeshes.set(a.id, grp);
      obj = grp;
    }
    obj.position.set(a.x, a.y, a.z);

    // Box wireframe child.
    let wire = obj.children.find(c => c.userData.kind === 'wireframe') as THREE.LineSegments | undefined;
    if (a.kind === 'box') {
      if (!wire) {
        wire = makeBoxWireframe();
        obj.add(wire);
      }
      wire.scale.set(a.sx ?? 10, a.sy ?? 10, a.sz ?? 10);
      const d = Math.PI / 180;
      wire.rotation.set((a.rx ?? 0) * d, (a.ry ?? 0) * d, (a.rz ?? 0) * d);
    } else if (wire) {
      obj.remove(wire);
      wire.geometry.dispose();
    }
  }
  const sel = store.selectedAnchorId ? anchorMeshes.get(store.selectedAnchorId) : null;
  if (sel) transform.attach(sel); else transform.detach();
}

watch(() => store.anchors.length, rebuildAnchors);
watch(() => store.selectedAnchorId, rebuildAnchors);
watch(
  () => store.anchors.map(a =>
    `${a.id}:${a.x},${a.y},${a.z}:${a.kind ?? 'point'}:${a.sx ?? 0},${a.sy ?? 0},${a.sz ?? 0}:${a.rx ?? 0},${a.ry ?? 0},${a.rz ?? 0}`,
  ).join('|'),
  rebuildAnchors,
);

// ---- Preview / assets ------------------------------------------------------

const DEFAULT_COLOR = 0x9fc1e8;

function solidMat(color: string | number | undefined): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: color ?? DEFAULT_COLOR,
    metalness: 0.0,
    roughness: 0.85,
    flatShading: true,
  });
}

function rebuildPreview(): void {
  resultGroup.clear();
  ghostGroup.clear();
  const edgeMat = new THREE.LineBasicMaterial({ color: 0x0a0d12 });

  const previewFile = store.files.find(f => f.id === store.previewFileId);
  if (previewFile?.kind === 'mesh') {
    const color = previewFile.color ?? DEFAULT_COLOR;
    const mesh = new THREE.Mesh(previewFile.geometry, solidMat(color));
    resultGroup.add(mesh);
    resultGroup.add(new THREE.LineSegments(new THREE.EdgesGeometry(previewFile.geometry, 30), edgeMat));
    return;
  }
  if (!store.output) return;

  const fileColor = previewFile?.kind === 'code' ? previewFile.color : undefined;

  for (const r of store.output) {
    const geom = manifoldToGeometry(r.manifold);
    const color = r.color ?? fileColor ?? DEFAULT_COLOR;
    const mesh = new THREE.Mesh(geom, solidMat(color));
    mesh.userData.resultName = r.name;
    resultGroup.add(mesh);
    resultGroup.add(new THREE.LineSegments(new THREE.EdgesGeometry(geom, 30), edgeMat));

    if (r.cuts?.length) {
      const ghostMat = new THREE.MeshStandardMaterial({
        color: 0x888888,
        transparent: true,
        opacity: 0.28,
        roughness: 0.9,
        depthWrite: false,
        depthTest: false,
        side: THREE.DoubleSide,
      });
      for (const cut of r.cuts) {
        const cg = manifoldToGeometry(cut);
        const cmesh = new THREE.Mesh(cg, ghostMat);
        cmesh.renderOrder = 999;
        ghostGroup.add(cmesh);
      }
    }
  }
  ghostGroup.visible = store.showGhosts;
}

watch(() => store.output, rebuildPreview, { deep: false });
watch(() => store.previewFileId, rebuildPreview);

function rebuildAssets(): void {
  assetGroup.clear();
  snapTargets = [];
  for (const f of store.files) {
    if (f.kind !== 'mesh') continue;
    if (f.id === store.previewFileId) continue;
    const mat = new THREE.MeshStandardMaterial({ color: 0x999999, transparent: true, opacity: 0.35, roughness: 0.85 });
    const mesh = new THREE.Mesh(f.geometry, mat);
    mesh.userData.assetName = f.name;
    assetGroup.add(mesh);
    snapTargets.push(mesh);
  }
  resultGroup.traverse(o => {
    if ((o as THREE.Mesh).isMesh) snapTargets.push(o as THREE.Mesh);
  });
}

watch(() => store.files.filter(f => f.kind === 'mesh').map(f => f.id).join('|'), rebuildAssets, { immediate: true });
watch(() => store.previewFileId, rebuildAssets);
watch(() => store.output, rebuildAssets, { deep: false });
watch(() => store.gridVisible, v => { if (grid) grid.visible = v; });
watch(() => store.showGhosts, v => { ghostGroup.visible = v; }, { immediate: true });
watch(() => store.files.map(f => `${f.id}:${f.color ?? ''}`).join('|'), rebuildPreview);

// ---- Picking & snapping ----------------------------------------------------

function onPointerDown(e: PointerEvent): void {
  if ((transform as any).dragging) return;
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(anchorGroup.children, true);
  if (hits.length) {
    let o: THREE.Object3D | null = hits[0].object;
    while (o && !o.userData.anchorId) o = o.parent;
    if (o) store.selectedAnchorId = o.userData.anchorId;
  }
}

function trySnapToGeometry(point: THREE.Vector3, preferVertex: boolean): THREE.Vector3 | null {
  if (!snapTargets.length) return null;
  const proj = point.clone().project(camera);
  raycaster.setFromCamera(new THREE.Vector2(proj.x, proj.y), camera);
  const hits = raycaster.intersectObjects(snapTargets, false);
  if (!hits.length) return null;
  const hit = hits[0];
  if (!preferVertex || !hit.face) return hit.point.clone();
  const g = (hit.object as THREE.Mesh).geometry as THREE.BufferGeometry;
  const pos = g.getAttribute('position');
  const verts = [hit.face.a, hit.face.b, hit.face.c].map(i =>
    new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(hit.object.matrixWorld),
  );
  let best = verts[0];
  let d = best.distanceTo(hit.point);
  for (const v of verts.slice(1)) {
    const dd = v.distanceTo(hit.point);
    if (dd < d) { d = dd; best = v; }
  }
  return best;
}
</script>

<style scoped>
.viewport { width: 100%; height: 100%; position: relative; }
.viewport canvas { display: block; }
.hud { position: absolute; left: 10px; top: 10px; padding: 4px 8px; font: 12px monospace; background: rgba(0,0,0,0.4); border-radius: 4px; pointer-events: none; }
.err { color: #ff8080; }
.overlay {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  z-index: 10;
}
.gizmo-host {
  width: 96px;
  height: 96px;
  position: relative;
}
</style>
