<template>
  <div class="flex items-center gap-3 border-b border-[#2c2f38] bg-[#20222a] px-2 py-1.5">
    <span class="font-semibold text-[#6fb0ff] text-sm">Bitty CAD</span>

    <UFieldGroup size="xs">
      <UButton icon="i-lucide-folder-open" variant="soft" color="neutral" @click="onOpen">Open</UButton>
      <UButton icon="i-lucide-save" variant="soft" color="neutral" @click="onSave">Save</UButton>
      <UButton icon="i-lucide-save-all" variant="soft" color="neutral" @click="onSaveAs">Save As…</UButton>
    </UFieldGroup>

    <input ref="openInput" type="file" accept=".bcad,.json" hidden @change="onOpenInput" />

    <div class="h-5 w-px bg-[#3a3e48]" />

    <UFormField label="Snap" size="xs" :ui="{ wrapper: 'flex items-center gap-2' }">
      <USelect v-model="store.snapStep" :items="snapItems" size="xs" />
    </UFormField>
    <UCheckbox v-model="store.snapToSurface" label="Surface" size="xs" />
    <UCheckbox v-model="store.snapToVertex" label="Vertex" size="xs" />

    <div class="h-5 w-px bg-[#3a3e48]" />
    <UCheckbox v-model="store.gridVisible" label="Grid" size="xs" />

    <span class="flex-1" />

    <span class="text-xs">
      <span v-if="store.error" class="text-[#ff8080] truncate max-w-[360px] inline-block align-middle">{{ store.error }}</span>
      <span v-else-if="store.building" class="text-[#888]">building…</span>
      <span v-else-if="store.output" class="text-[#888]">{{ store.output.length }} part(s)</span>
    </span>

    <UFormField label="Export" size="xs" :ui="{ wrapper: 'flex items-center gap-2' }">
      <USelect v-model="format" :items="formatItems" size="xs" />
    </UFormField>
    <UButton
      size="xs"
      icon="i-lucide-download"
      :disabled="!store.output?.length"
      @click="doExport"
    >Download</UButton>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { store } from '../store';
import { exportResults, downloadFiles, type ExportFormat } from '../lib/exporters';
import { saveProject, saveProjectAs, openProject, hasFsAccess, downloadProject, openProjectFromInput } from '../lib/project';

const format = ref<ExportFormat>('stl');
const openInput = ref<HTMLInputElement | null>(null);

const formatItems = [
  { label: 'STL', value: 'stl' },
  { label: 'GLB', value: 'glb' },
  { label: '3MF', value: '3mf' },
];

const snapItems = [
  { label: '5 mm',    value: 5 },
  { label: '1 mm',    value: 1 },
  { label: '0.5 mm',  value: 0.5 },
  { label: '0.25 mm', value: 0.25 },
  { label: '0.1 mm',  value: 0.1 },
];

async function doExport(): Promise<void> {
  if (!store.output) return;
  try {
    const files = await exportResults(store.output, format.value);
    downloadFiles(files);
  } catch (e: any) {
    alert(e?.message ?? String(e));
  }
}

async function onSave(): Promise<void> {
  try {
    if (hasFsAccess()) await saveProject();
    else downloadProject();
  } catch (e: any) {
    if (e?.name !== 'AbortError') alert(`Save failed: ${e?.message ?? e}`);
  }
}
async function onSaveAs(): Promise<void> {
  try {
    if (hasFsAccess()) await saveProjectAs();
    else downloadProject();
  } catch (e: any) {
    if (e?.name !== 'AbortError') alert(`Save failed: ${e?.message ?? e}`);
  }
}
async function onOpen(): Promise<void> {
  if (hasFsAccess()) {
    try { await openProject(); }
    catch (e: any) { if (e?.name !== 'AbortError') alert(`Open failed: ${e?.message ?? e}`); }
  } else {
    openInput.value?.click();
  }
}
async function onOpenInput(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement;
  const f = input.files?.[0];
  if (f) {
    try { await openProjectFromInput(f); }
    catch (e: any) { alert(`Open failed: ${e?.message ?? e}`); }
  }
  input.value = '';
}
</script>
