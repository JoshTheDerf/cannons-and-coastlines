<template>
  <UApp>
    <div class="flex h-full flex-col">
      <Toolbar />
      <div class="flex flex-1 min-h-0">
        <aside class="w-[300px] flex flex-col border-r border-[#2c2f38]">
          <AssetPane class="flex-1 min-h-0" />
          <AnchorList class="flex-1 min-h-0 border-t border-[#2c2f38]" />
        </aside>
        <main class="flex flex-1 flex-col min-w-0">
          <div class="flex-[1.4] min-h-0"><Viewport /></div>
          <div class="flex-1 min-h-0 flex flex-col border-t border-[#2c2f38]">
            <UTabs
              v-model="store.bottomTab"
              :items="tabItems"
              size="xs"
              variant="link"
              class="flex-1 min-h-0 flex flex-col"
              :ui="{ root: 'flex-1 min-h-0 flex flex-col', content: 'flex-1 min-h-0', list: 'shrink-0' }"
            >
              <template #content="{ item }">
                <CodeEditor v-if="item.value === 'editor'" class="h-full" />
                <Console v-else class="h-full" />
              </template>
            </UTabs>
          </div>
        </main>
      </div>
    </div>
  </UApp>
</template>

<script setup lang="ts">
import { computed, onMounted, watch } from 'vue';
import Toolbar from './components/Toolbar.vue';
import AssetPane from './components/AssetPane.vue';
import AnchorList from './components/AnchorList.vue';
import Viewport from './components/Viewport.vue';
import CodeEditor from './components/CodeEditor.vue';
import Console from './components/Console.vue';
import {
  store, codeFilesMap, meshFilesMap, anchorsAsMap, addAnchor, addMeshFile, appendLog,
} from './store';
import { runFile } from './lib/userCode';
import { startThumbnailService } from './lib/thumbnailService';
import { loadFile } from './lib/loaders';
import { geometryToManifold } from './lib/meshConvert';
import { getManifold } from './lib/manifold';

const tabItems = computed(() => [
  { label: 'Editor', value: 'editor', icon: 'i-lucide-code-2' },
  {
    label: store.logs.length ? `Console (${store.logs.length})` : 'Console',
    value: 'console',
    icon: 'i-lucide-terminal',
  },
]);

let timer: ReturnType<typeof setTimeout> | null = null;

async function build(): Promise<void> {
  const previewFile = store.files.find(f => f.id === store.previewFileId && f.kind === 'code');
  if (!previewFile) { store.output = []; store.error = null; return; }
  store.building = true;
  const { results, error } = await runFile(
    previewFile.name,
    codeFilesMap(),
    meshFilesMap(),
    anchorsAsMap(),
    appendLog,
  );
  store.building = false;
  store.error = error;
  if (!error) {
    store.output = results;
    if (!results.length) {
      appendLog('info', 'Run produced no Manifolds. Return a Manifold, an array, or { name: Manifold }.', previewFile.name);
    }
  }
}

function schedule(): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(build, 250);
}

onMounted(async () => {
  if (!store.anchors.length) {
    addAnchor('mast',   { x: 0,  y: 0, z: 0 });
    addAnchor('cannon', { x: 12, y: 0, z: 0 });
  }
  await loadDefaultShip();
  build();
  startThumbnailService();
});

async function loadDefaultShip(): Promise<void> {
  if (store.files.some(f => f.kind === 'mesh' && f.name === 'ship')) return;
  try {
    const res = await fetch('/ship-corsair.stl');
    if (!res.ok) return;
    const bytes = new Uint8Array(await res.arrayBuffer());
    const file = new File([bytes as BlobPart], 'ship-corsair.stl');
    const geometry = await loadFile(file);
    const wasm = await getManifold();
    const { manifold, error } = geometryToManifold(wasm, geometry);
    addMeshFile('ship', geometry, 'stl', bytes, manifold, error);
    if (error) appendLog('warn', `ship import: ${error}`, 'ship');
  } catch (e: any) {
    appendLog('warn', `failed to load default ship: ${e?.message ?? e}`);
  }
}

watch(() => [
  store.previewFileId,
  store.files.map(f => f.kind === 'code' ? `${f.id}:c:${f.code}` : `${f.id}:m:${f.manifold ? 1 : 0}:${f.visible ? 1 : 0}`).join('|'),
  store.anchors.map(a => `${a.name}@${a.x},${a.y},${a.z}`).join('|'),
], schedule, { deep: false });
</script>
