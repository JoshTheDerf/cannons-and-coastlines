import { watch } from 'vue';
import { manifoldToGeometry } from './meshConvert';
import { renderThumbnail } from './thumbnail';
import { runFile } from './userCode';
import { store, codeFilesMap, meshFilesMap, anchorsAsMap } from '../store';

const lastSource = new Map<string, string>();
let timer: ReturnType<typeof setTimeout> | null = null;
let running = false;

export function startThumbnailService(): void {
  watch(
    () => store.files.map(f => f.kind === 'code'
      ? `${f.id}:c:${f.code}`
      : `${f.id}:m:${f.geometry.uuid}`).join('|'),
    schedule,
    { immediate: true },
  );
  watch(() => store.anchors.map(a => `${a.name}@${a.x},${a.y},${a.z}`).join('|'), () => {
    // Invalidate code thumbnails on anchor change (they may depend on anchors)
    for (const f of store.files) if (f.kind === 'code') lastSource.delete(f.id);
    schedule();
  });
}

function schedule(): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(rebuildAll, 300);
}

async function rebuildAll(): Promise<void> {
  if (running) { schedule(); return; }
  running = true;
  try {
    // Drop thumbnails for removed files
    for (const id of Object.keys(store.thumbnails)) {
      if (!store.files.find(f => f.id === id)) delete store.thumbnails[id];
    }

    for (const f of store.files) {
      if (f.kind === 'mesh') {
        if (!store.thumbnails[f.id]) {
          store.thumbnails[f.id] = renderThumbnail([f.geometry], 128);
        }
        continue;
      }
      const sig = f.code;
      if (lastSource.get(f.id) === sig && store.thumbnails[f.id]) continue;
      lastSource.set(f.id, sig);
      const { results } = await runFile(f.name, codeFilesMap(), meshFilesMap(), anchorsAsMap());
      const geoms = results.map(r => manifoldToGeometry(r.manifold));
      store.thumbnails[f.id] = geoms.length ? renderThumbnail(geoms, 128) : '';
    }
  } finally {
    running = false;
  }
}
