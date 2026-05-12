<template>
  <div class="flex h-full flex-col bg-[#14151a] text-[#e6e6e6]">
    <div class="flex items-center gap-2 border-b border-[#2c2f38] px-2 py-1">
      <span class="text-xs text-[#888]">{{ store.logs.length }} entries</span>
      <span class="flex-1" />
      <UButton size="xs" variant="ghost" icon="i-lucide-trash-2" @click="clearLogs">Clear</UButton>
    </div>
    <div ref="scrollRef" class="flex-1 overflow-auto px-2 py-1 font-mono text-xs leading-5">
      <div v-if="!store.logs.length" class="text-[#666] italic">No output yet.</div>
      <div
        v-for="entry in store.logs"
        :key="entry.id"
        class="flex gap-2 whitespace-pre-wrap break-words"
        :class="levelClass(entry.level)"
      >
        <span class="shrink-0 text-[#666]">{{ formatTime(entry.time) }}</span>
        <span class="shrink-0 uppercase text-[10px] mt-0.5">{{ entry.level }}</span>
        <span v-if="entry.file" class="shrink-0 text-[#6fb0ff]">[{{ entry.file }}]</span>
        <span class="flex-1">{{ entry.message }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';
import { store, clearLogs, type LogLevel } from '../store';

const scrollRef = ref<HTMLDivElement | null>(null);

watch(() => store.logs.length, async () => {
  await nextTick();
  const el = scrollRef.value;
  if (el) el.scrollTop = el.scrollHeight;
});

function levelClass(level: LogLevel): string {
  switch (level) {
    case 'error': return 'text-[#ff8080]';
    case 'warn':  return 'text-[#ffcc66]';
    case 'info':  return 'text-[#6fb0ff]';
    default:      return 'text-[#cfcfcf]';
  }
}

function formatTime(t: number): string {
  const d = new Date(t);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
function pad(n: number): string { return n.toString().padStart(2, '0'); }
</script>
