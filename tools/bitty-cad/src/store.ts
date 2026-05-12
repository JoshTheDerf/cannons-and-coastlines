import { reactive } from 'vue';
import type { BufferGeometry } from 'three';
import type { Manifold } from 'manifold-3d';

export interface CodeFile {
  id: string;
  name: string;
  kind: 'code';
  code: string;
  visible: boolean;
  color?: string;
}

export interface MeshFile {
  id: string;
  name: string;
  kind: 'mesh';
  geometry: BufferGeometry;
  manifold: Manifold | null;
  manifoldError: string | null;
  visible: boolean;
  color?: string;
  sourceExt: string;
  sourceBytes: Uint8Array;
}

export type ProjectFile = CodeFile | MeshFile;

export interface Anchor {
  id: string;
  name: string;
  x: number;
  y: number;
  z: number;
  kind?: 'point' | 'box';
  rx?: number; ry?: number; rz?: number;
  sx?: number; sy?: number; sz?: number;
}

export interface BuildResult {
  name: string;
  manifold: Manifold;
  color?: string;
  cuts?: Manifold[];
}

export type LogLevel = 'log' | 'info' | 'warn' | 'error';

export interface LogEntry {
  id: number;
  level: LogLevel;
  message: string;
  file?: string;
  time: number;
}

export interface Store {
  files: ProjectFile[];
  activeFileId: string | null;
  previewFileId: string | null;
  anchors: Anchor[];
  selectedAnchorId: string | null;
  snapStep: number;
  snapToSurface: boolean;
  snapToVertex: boolean;
  gridVisible: boolean;
  output: BuildResult[] | null;
  error: string | null;
  building: boolean;
  logs: LogEntry[];
  bottomTab: 'editor' | 'console';
  thumbnails: Record<string, string>;
  showGhosts: boolean;
}

const STARTER_MAIN = `// main.js — chamfer practice on a simple stair-step shape.
//
// chamferEdge() slices the mesh perpendicular to the box anchor's local Z
// axis, finds ALL corners (above the minTurn threshold) inside the box
// footprint at each slice, groups them across slices into edge chains by
// nearest-neighbor XY matching, then sweeps tangent wedges along each chain
// and subtracts the union from the mesh.
//
// Edge length is auto-detected: chains end where the corner stops appearing
// in non-empty slices. The box's sz is a MAX search range — make it bigger
// than any edge you'd expect to hit and the chamfer fits automatically.
//
// Handles both convex (outer) and concave (inner) edges. opts.subtract
// chamfers convex edges; opts.add fillets concave edges; both can be on.
// opts.profile picks 'round' (arc) or 'wedge' (flat bevel).
//
// 'chamfer1' is sized generously (60x60x80) — auto-extent trims each chamfer
// to its actual edge length. opts.axes lets one call sweep multiple axes:
// ['x','y','z'] chamfers every convex edge in the box.

const { Manifold } = m;
const { chamferEdge } = use('fillet');

const base = Manifold.cube([40, 40, 10], true);
const top  = Manifold.cube([20, 40, 20], true).translate([10, 0, 15]);
const step = base.add(top);

if (!anchors.chamfer1 || anchors.chamfer1.kind !== 'box') {
  console.warn('Add a box anchor named "chamfer1" — use the AnchorList +Box button.');
  return { step: { manifold: step, color: '#9fc1e8' } };
}

// axes: ['x','y','z'] chamfers every convex edge regardless of direction.
// Drop to ['z'] (default) to chamfer only edges aligned with box-local Z.
// Try toggling subtract/add and switching profile between 'round' and 'wedge'.
//   subtract:true  → chamfers the 5 convex outer edges of the L
//   add:true       → fillets the 1 concave inner edge at (x=0, z=5)
//   profile:'wedge' → straight bevel (flat chamfer) instead of rounded
const out = chamferEdge(step, anchors.chamfer1, 2.5, {
  axes: ['x', 'y', 'z'],
  subtract: true,
  add: true,
  profile: 'round',
  step: 0.2,
});
return { step: { manifold: out, color: '#9fc1e8' } };
`;

let nextId = 1;
export function newId(): string { return `id_${nextId++}`; }

export const store: Store = reactive({
  files: [
    { id: newId(), name: 'main', kind: 'code', code: STARTER_MAIN, visible: true },
  ] as ProjectFile[],
  activeFileId: null,
  previewFileId: null,
  anchors: [
    {
      id: newId(), name: 'chamfer1', kind: 'box',
      x: 0, y: 0, z: 10,
      rx: 90, ry: 0, rz: 0,           // local Z → world Y (edge direction)
      sx: 60, sy: 60, sz: 80,         // sz oversized — auto-extent trims to actual edge length

    },
  ],
  selectedAnchorId: null,
  snapStep: 1.0,
  snapToSurface: false,
  snapToVertex: false,
  gridVisible: true,
  output: null,
  error: null,
  building: false,
  logs: [],
  bottomTab: 'editor',
  thumbnails: {},
  showGhosts: false,
});

let logSeq = 1;
export function appendLog(level: LogLevel, message: string, file?: string): void {
  store.logs.push({ id: logSeq++, level, message, file, time: Date.now() });
  if (store.logs.length > 500) store.logs.splice(0, store.logs.length - 500);
}
export function clearLogs(): void { store.logs.length = 0; }
store.activeFileId = store.files[0].id;
store.previewFileId = store.files[0].id;

export function addCodeFile(name = 'untitled'): string {
  const f: CodeFile = {
    id: newId(),
    name: uniqueName(name),
    kind: 'code',
    code: '// new file\nreturn null;\n',
    visible: true,
  };
  store.files.push(f);
  store.activeFileId = f.id;
  store.previewFileId = f.id;
  return f.id;
}

export function addMeshFile(
  name: string,
  geometry: BufferGeometry,
  sourceExt: string,
  sourceBytes: Uint8Array,
  manifold: Manifold | null = null,
  manifoldError: string | null = null,
): string {
  const f: MeshFile = {
    id: newId(),
    name: uniqueName(name),
    kind: 'mesh',
    geometry,
    manifold,
    manifoldError,
    visible: true,
    sourceExt,
    sourceBytes,
  };
  store.files.push(f);
  return f.id;
}

export function resetProject(): void {
  store.files.splice(0, store.files.length);
  store.anchors.splice(0, store.anchors.length);
  store.selectedAnchorId = null;
  store.activeFileId = null;
  store.previewFileId = null;
  store.output = null;
  store.error = null;
  store.logs.length = 0;
}

export function removeFile(id: string): void {
  const i = store.files.findIndex(f => f.id === id);
  if (i < 0) return;
  store.files.splice(i, 1);
  if (store.activeFileId === id) {
    const next = store.files.find(f => f.kind === 'code');
    store.activeFileId = next?.id ?? null;
  }
  if (store.previewFileId === id) {
    const next = store.files.find(f => f.kind === 'code');
    store.previewFileId = next?.id ?? null;
  }
}

export function renameFile(id: string, name: string): void {
  const f = store.files.find(x => x.id === id);
  if (!f) return;
  f.name = uniqueName(name, id);
}

function uniqueName(base: string, ignoreId: string | null = null): string {
  const n = base.trim().replace(/[^a-z0-9_-]+/gi, '_') || 'file';
  let candidate = n;
  let k = 2;
  while (store.files.some(f => f.id !== ignoreId && f.name === candidate)) {
    candidate = `${n}_${k++}`;
  }
  return candidate;
}

export function getActiveCodeFile(): CodeFile | null {
  const f = store.files.find(f => f.id === store.activeFileId);
  return f && f.kind === 'code' ? f : null;
}

export function getPreviewCodeFile(): CodeFile | null {
  const f = store.files.find(f => f.id === store.previewFileId);
  return f && f.kind === 'code' ? f : null;
}

export function codeFilesMap(): Record<string, string> {
  const map: Record<string, string> = {};
  for (const f of store.files) if (f.kind === 'code') map[f.name] = f.code;
  return map;
}

export interface ExposedMesh {
  manifold: Manifold | null;
  geometry: BufferGeometry;
  visible: boolean;
}

export function meshFilesMap(): Record<string, ExposedMesh> {
  const map: Record<string, ExposedMesh> = {};
  for (const f of store.files) {
    if (f.kind === 'mesh') {
      map[f.name] = { manifold: f.manifold, geometry: f.geometry, visible: f.visible };
    }
  }
  return map;
}

export function addAnchor(name: string, pos = { x: 0, y: 0, z: 0 }): string {
  const id = newId();
  store.anchors.push({ id, name: uniqueAnchorName(name), kind: 'point', ...pos });
  store.selectedAnchorId = id;
  return id;
}

export function addBoxAnchor(
  name: string,
  pos = { x: 0, y: 0, z: 0 },
  size = { sx: 10, sy: 10, sz: 10 },
  rot = { rx: 0, ry: 0, rz: 0 },
): string {
  const id = newId();
  store.anchors.push({
    id, name: uniqueAnchorName(name), kind: 'box',
    ...pos, ...size, ...rot,
  });
  store.selectedAnchorId = id;
  return id;
}

export function removeAnchor(id: string): void {
  const i = store.anchors.findIndex(a => a.id === id);
  if (i >= 0) store.anchors.splice(i, 1);
  if (store.selectedAnchorId === id) store.selectedAnchorId = null;
}

function uniqueAnchorName(base: string): string {
  const n = (base || 'anchor').replace(/[^a-z0-9_]/gi, '_');
  let candidate = n, k = 2;
  while (store.anchors.some(a => a.name === candidate)) candidate = `${n}_${k++}`;
  return candidate;
}

export interface ExposedAnchor {
  x: number; y: number; z: number;
  kind: 'point' | 'box';
  rx: number; ry: number; rz: number;
  sx: number; sy: number; sz: number;
}

export function anchorsAsMap(): Record<string, ExposedAnchor> {
  const out: Record<string, ExposedAnchor> = {};
  for (const a of store.anchors) {
    out[a.name] = {
      x: a.x, y: a.y, z: a.z,
      kind: a.kind ?? 'point',
      rx: a.rx ?? 0, ry: a.ry ?? 0, rz: a.rz ?? 0,
      sx: a.sx ?? 0, sy: a.sy ?? 0, sz: a.sz ?? 0,
    };
  }
  return out;
}
