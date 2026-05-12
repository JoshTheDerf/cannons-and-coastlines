<template>
  <div class="editor-wrap">
    <div class="tabbar">
      <span class="active-file" v-if="file">editing: <b>{{ file.name }}</b></span>
      <span v-else class="muted">no code file selected</span>
    </div>
    <div ref="hostRef" class="editor"></div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch, computed } from 'vue';
import * as monaco from 'monaco-editor';
import { store, getActiveCodeFile } from '../store';
import { initMonacoIntellisense, refreshMonacoTypes } from '../lib/monacoIntellisense';

const hostRef = ref<HTMLDivElement | null>(null);
let editor: monaco.editor.IStandaloneCodeEditor | null = null;
let suppress = false;

const file = computed(() => getActiveCodeFile());

onMounted(() => {
  initMonacoIntellisense(monaco);
  refreshMonacoTypes(monaco);
  editor = monaco.editor.create(hostRef.value!, {
    value: file.value?.code || '',
    language: 'javascript',
    theme: 'vs-dark',
    automaticLayout: true,
    minimap: { enabled: false },
    fontSize: 13,
    scrollBeyondLastLine: false,
  });
  editor.onDidChangeModelContent(() => {
    if (suppress || !editor) return;
    const f = file.value;
    if (f) f.code = editor.getValue();
  });
});

onBeforeUnmount(() => editor?.dispose());

watch(() => store.activeFileId, () => {
  if (!editor) return;
  suppress = true;
  editor.setValue(file.value?.code || '');
  suppress = false;
});

watch(
  () => [
    store.files.filter(f => f.kind === 'code').map(f => f.name).join('|'),
    store.files.filter(f => f.kind === 'mesh').map(f => f.name).join('|'),
    store.anchors.map(a => a.name).join('|'),
  ],
  () => refreshMonacoTypes(monaco),
  { deep: false },
);
</script>

<style scoped>
.editor-wrap { display: flex; flex-direction: column; height: 100%; }
.tabbar { padding: 4px 8px; font: 12px monospace; background: #20222a; border-bottom: 1px solid #2c2f38; }
.tabbar b { color: #6fb0ff; }
.muted { color: #888; }
.editor { flex: 1; min-height: 0; }
</style>
