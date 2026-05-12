import { store, addCodeFile, addMeshFile, resetProject, addAnchor, newId } from '../store';
import { loadFile } from './loaders';
import { geometryToManifold } from './meshConvert';
import { getManifold } from './manifold';

const PROJECT_VERSION = 1;

interface SerializedCodeFile { kind: 'code'; name: string; code: string; }
interface SerializedMeshFile {
  kind: 'mesh';
  name: string;
  visible: boolean;
  sourceExt: string;
  data: string; // base64
}
interface SerializedAnchor { name: string; x: number; y: number; z: number; }

export interface SerializedProject {
  version: number;
  files: Array<SerializedCodeFile | SerializedMeshFile>;
  anchors: SerializedAnchor[];
  settings: {
    snapStep: number;
    snapToSurface: boolean;
    snapToVertex: boolean;
    gridVisible: boolean;
    previewFile?: string;
    activeFile?: string;
  };
}

export function serializeProject(): SerializedProject {
  const previewName = store.files.find(f => f.id === store.previewFileId)?.name;
  const activeName = store.files.find(f => f.id === store.activeFileId)?.name;
  return {
    version: PROJECT_VERSION,
    files: store.files.map(f => {
      if (f.kind === 'code') {
        return { kind: 'code', name: f.name, code: f.code } satisfies SerializedCodeFile;
      }
      return {
        kind: 'mesh',
        name: f.name,
        visible: f.visible,
        sourceExt: f.sourceExt,
        data: bytesToBase64(f.sourceBytes),
      } satisfies SerializedMeshFile;
    }),
    anchors: store.anchors.map(a => ({ name: a.name, x: a.x, y: a.y, z: a.z })),
    settings: {
      snapStep: store.snapStep,
      snapToSurface: store.snapToSurface,
      snapToVertex: store.snapToVertex,
      gridVisible: store.gridVisible,
      previewFile: previewName,
      activeFile: activeName,
    },
  };
}

export async function applyProject(project: SerializedProject): Promise<void> {
  if (!project || project.version > PROJECT_VERSION) {
    throw new Error(`Unsupported project version: ${project?.version}`);
  }
  resetProject();
  const wasm = await getManifold();

  for (const f of project.files) {
    if (f.kind === 'code') {
      const id = addCodeFile(f.name);
      const stored = store.files.find(x => x.id === id);
      if (stored && stored.kind === 'code') stored.code = f.code;
    } else {
      const bytes = base64ToBytes(f.data);
      const file = new File([bytes as BlobPart], `${f.name}.${f.sourceExt}`);
      try {
        const geometry = await loadFile(file);
        const { manifold, error } = geometryToManifold(wasm, geometry);
        addMeshFile(f.name, geometry, f.sourceExt, bytes, manifold, error);
        const last = store.files[store.files.length - 1];
        if (last && last.kind === 'mesh') last.visible = f.visible;
      } catch (e: any) {
        console.error(`Failed to load mesh "${f.name}":`, e);
      }
    }
  }

  for (const a of project.anchors) addAnchor(a.name, { x: a.x, y: a.y, z: a.z });
  store.selectedAnchorId = null;

  const s = project.settings;
  store.snapStep = s.snapStep;
  store.snapToSurface = s.snapToSurface;
  store.snapToVertex = s.snapToVertex;
  store.gridVisible = s.gridVisible;

  const preview = store.files.find(f => f.name === s.previewFile && f.kind === 'code');
  const active = store.files.find(f => f.name === s.activeFile && f.kind === 'code');
  const fallback = store.files.find(f => f.kind === 'code');
  store.previewFileId = preview?.id ?? fallback?.id ?? null;
  store.activeFileId  = active?.id  ?? fallback?.id ?? null;
}

// ---- File System Access ---------------------------------------------------

let currentHandle: FileSystemFileHandle | null = null;

export function hasFsAccess(): boolean {
  return typeof (window as any).showSaveFilePicker === 'function';
}

export function currentProjectName(): string | null {
  return currentHandle?.name ?? null;
}

const PROJECT_PICKER_OPTS = {
  types: [{
    description: 'Bitty CAD project',
    accept: { 'application/json': ['.bcad'] },
  }],
  suggestedName: 'project.bcad',
} as const;

export async function saveProjectAs(): Promise<void> {
  if (!hasFsAccess()) throw new Error('File System Access API not available in this browser.');
  const handle = await (window as any).showSaveFilePicker(PROJECT_PICKER_OPTS);
  currentHandle = handle;
  await writeCurrent();
}

export async function saveProject(): Promise<void> {
  if (!currentHandle) return saveProjectAs();
  await writeCurrent();
}

async function writeCurrent(): Promise<void> {
  if (!currentHandle) return;
  const project = serializeProject();
  const json = JSON.stringify(project, null, 2);
  const writable = await currentHandle.createWritable();
  await writable.write(json);
  await writable.close();
}

export async function openProject(): Promise<void> {
  if (!hasFsAccess()) throw new Error('File System Access API not available in this browser.');
  const [handle] = await (window as any).showOpenFilePicker({
    types: [{ description: 'Bitty CAD project', accept: { 'application/json': ['.bcad'] } }],
    multiple: false,
  });
  currentHandle = handle;
  const file = await handle.getFile();
  const text = await file.text();
  const project: SerializedProject = JSON.parse(text);
  await applyProject(project);
}

// Fallback save (no FS Access API) — triggers download
export function downloadProject(): void {
  const project = serializeProject();
  const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'project.bcad';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Fallback open via <input type="file">
export async function openProjectFromInput(file: File): Promise<void> {
  const text = await file.text();
  const project: SerializedProject = JSON.parse(text);
  await applyProject(project);
}

// ---- base64 helpers -------------------------------------------------------

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
  }
  return btoa(bin);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
