<template>
  <div class="flex h-full flex-col bg-[#1d1f26]">
    <div class="flex items-center gap-2 border-b border-[#2c2f38] px-2 py-1.5">
      <span class="text-xs font-semibold text-[#bbb]">Files</span>
      <span class="flex-1" />
      <UButton size="xs" variant="soft" color="neutral" icon="i-lucide-file-plus" @click="addCode">Code</UButton>
      <UButton size="xs" variant="soft" color="neutral" icon="i-lucide-upload" @click="pickFile">Import</UButton>
      <input ref="fileInput" type="file" multiple accept=".stl,.glb,.gltf,.fbx" hidden @change="onFiles" />
    </div>

    <div class="grid grid-cols-2 gap-2 overflow-auto p-2">
      <div
        v-for="f in store.files"
        :key="f.id"
        class="group relative flex flex-col rounded-md border bg-[#22252e] transition-all cursor-pointer hover:border-[#4a5060]"
        :class="cardClass(f)"
        @click="onClick(f)"
      >
        <div class="aspect-square overflow-hidden rounded-t-md bg-[#16181f] flex items-center justify-center">
          <img v-if="store.thumbnails[f.id]" :src="store.thumbnails[f.id]" class="h-full w-full object-contain" />
          <UIcon
            v-else
            :name="f.kind === 'code' ? 'i-lucide-file-code-2' : 'i-lucide-shapes'"
            class="h-8 w-8 text-[#555]"
          />
        </div>
        <div class="flex items-center gap-1 px-1.5 py-1 text-[11px]">
          <UBadge
            :color="f.kind === 'code' ? 'success' : 'info'"
            variant="subtle"
            size="xs"
            class="shrink-0"
          >{{ f.kind === 'code' ? 'JS' : 'M' }}</UBadge>
          <label
            class="block h-3.5 w-3.5 shrink-0 cursor-pointer rounded-sm border border-[#3a3e48]"
            :style="{ background: f.color ?? '#9fc1e8' }"
            title="Set color"
            @click.stop
          >
            <input
              type="color"
              :value="f.color ?? '#9fc1e8'"
              class="invisible h-0 w-0"
              @input="onColor(f, $event)"
            />
          </label>
          <input
            v-if="renaming === f.id"
            v-model="renameValue"
            class="flex-1 rounded bg-[#14151a] px-1 text-xs text-white border border-[#6fb0ff] outline-none"
            @click.stop
            @blur="commitRename(f)"
            @keydown.enter="commitRename(f)"
            @keydown.escape="renaming = null"
          />
          <span
            v-else
            class="flex-1 truncate"
            :class="f.id === store.previewFileId ? 'text-[#6fb0ff] font-semibold' : 'text-[#ddd]'"
            @dblclick.stop="startRename(f)"
          >{{ f.name }}</span>
          <span v-if="f.kind === 'mesh' && f.manifoldError" class="text-[#ffaa55]" title="Non-manifold">!</span>
        </div>

        <div class="absolute right-1 top-1 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <UButton
            icon="i-lucide-x"
            size="2xs"
            variant="solid"
            color="error"
            @click.stop="remove(f)"
          />
        </div>
      </div>

      <div v-if="!store.files.length" class="col-span-2 py-8 text-center text-xs text-[#666]">
        No files yet.
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { store, addCodeFile, addMeshFile, removeFile, renameFile, type ProjectFile } from '../store';
import { loadFile } from '../lib/loaders';
import { geometryToManifold } from '../lib/meshConvert';
import { getManifold } from '../lib/manifold';

const fileInput = ref<HTMLInputElement | null>(null);
const renaming = ref<string | null>(null);
const renameValue = ref('');

function pickFile(): void { fileInput.value?.click(); }

async function onFiles(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement;
  if (!input.files) return;
  const wasm = await getManifold();
  for (const file of Array.from(input.files)) {
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const ext = (file.name.split('.').pop() ?? '').toLowerCase();
      const geometry = await loadFile(file);
      const { manifold, error } = geometryToManifold(wasm, geometry);
      const baseName = file.name.replace(/\.[^.]+$/, '');
      addMeshFile(baseName, geometry, ext, bytes, manifold, error);
    } catch (err: any) {
      console.error(err);
      alert(`Failed to load ${file.name}: ${err?.message ?? err}`);
    }
  }
  input.value = '';
}

function onClick(f: ProjectFile): void {
  store.previewFileId = f.id;
  if (f.kind === 'code') store.activeFileId = f.id;
}

function remove(f: ProjectFile): void { removeFile(f.id); }

function onColor(f: ProjectFile, e: Event): void {
  const v = (e.target as HTMLInputElement).value;
  f.color = v;
}
function addCode(): void { addCodeFile('untitled'); }

function startRename(f: ProjectFile): void {
  renaming.value = f.id;
  renameValue.value = f.name;
}
function commitRename(f: ProjectFile): void {
  if (renaming.value !== f.id) return;
  renameFile(f.id, renameValue.value || f.name);
  renaming.value = null;
}

function cardClass(f: ProjectFile): string {
  if (f.id === store.previewFileId) return 'border-[#6fb0ff] ring-1 ring-[#6fb0ff]';
  if (f.id === store.activeFileId) return 'border-[#4a6fa8]';
  return 'border-[#2c2f38]';
}
</script>
