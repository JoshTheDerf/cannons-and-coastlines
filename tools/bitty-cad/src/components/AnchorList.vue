<template>
  <div class="flex h-full flex-col bg-[#1d1f26]">
    <div class="flex items-center gap-2 border-b border-[#2c2f38] px-2 py-1.5">
      <span class="text-xs font-semibold text-[#bbb]">Anchors</span>
      <span class="flex-1" />
      <UButton size="xs" variant="soft" color="neutral" icon="i-lucide-plus" @click="addPoint">Point</UButton>
      <UButton size="xs" variant="soft" color="neutral" icon="i-lucide-box" @click="addBox">Box</UButton>
    </div>

    <div class="max-h-60 overflow-auto">
      <div
        v-for="a in store.anchors"
        :key="a.id"
        class="flex items-center gap-2 px-2 py-1 text-xs cursor-pointer hover:bg-[#262a35]"
        :class="{ 'bg-[#2a3242]': a.id === store.selectedAnchorId }"
        @click="store.selectedAnchorId = a.id"
      >
        <span class="h-2 w-2 rounded-full" :class="a.kind === 'box' ? 'bg-[#66ccff]' : 'bg-[#ffaa33]'" />
        <span class="truncate">{{ a.name }}</span>
        <span class="flex-1 text-right text-[10px] text-[#888]">
          ({{ fmt(a.x) }}, {{ fmt(a.y) }}, {{ fmt(a.z) }})
        </span>
        <UButton icon="i-lucide-x" size="2xs" variant="ghost" color="neutral" @click.stop="remove(a)" />
      </div>
      <div v-if="!store.anchors.length" class="px-2 py-4 text-center text-xs text-[#666]">
        No anchors. Click + Point or + Box.
      </div>
    </div>

    <div v-if="selected" class="border-t border-[#2c2f38] p-2 space-y-2 overflow-auto">
      <UFormField label="Name" size="xs">
        <UInput v-model="selected.name" size="xs" />
      </UFormField>
      <div class="grid grid-cols-3 gap-2">
        <UFormField label="X" size="xs">
          <UInput v-model.number="selected.x" type="number" step="0.1" size="xs" />
        </UFormField>
        <UFormField label="Y" size="xs">
          <UInput v-model.number="selected.y" type="number" step="0.1" size="xs" />
        </UFormField>
        <UFormField label="Z" size="xs">
          <UInput v-model.number="selected.z" type="number" step="0.1" size="xs" />
        </UFormField>
      </div>
      <template v-if="selected.kind === 'box'">
        <div class="text-[10px] uppercase tracking-wide text-[#888]">Size (mm)</div>
        <div class="grid grid-cols-3 gap-2">
          <UFormField label="SX" size="xs">
            <UInput v-model.number="selected.sx" type="number" step="0.5" size="xs" />
          </UFormField>
          <UFormField label="SY" size="xs">
            <UInput v-model.number="selected.sy" type="number" step="0.5" size="xs" />
          </UFormField>
          <UFormField label="SZ" size="xs">
            <UInput v-model.number="selected.sz" type="number" step="0.5" size="xs" />
          </UFormField>
        </div>
        <div class="text-[10px] uppercase tracking-wide text-[#888]">Rotation (deg, XYZ Euler)</div>
        <div class="grid grid-cols-3 gap-2">
          <UFormField label="RX" size="xs">
            <UInput v-model.number="selected.rx" type="number" step="5" size="xs" />
          </UFormField>
          <UFormField label="RY" size="xs">
            <UInput v-model.number="selected.ry" type="number" step="5" size="xs" />
          </UFormField>
          <UFormField label="RZ" size="xs">
            <UInput v-model.number="selected.rz" type="number" step="5" size="xs" />
          </UFormField>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { store, addAnchor, addBoxAnchor, removeAnchor, type Anchor } from '../store';

const selected = computed(() => store.anchors.find(a => a.id === store.selectedAnchorId) || null);

function addPoint(): void {
  let n = 1;
  while (store.anchors.some(a => a.name === `anchor${n}`)) n++;
  addAnchor(`anchor${n}`);
}
function addBox(): void {
  let n = 1;
  while (store.anchors.some(a => a.name === `box${n}`)) n++;
  addBoxAnchor(`box${n}`);
}
function remove(a: Anchor): void { removeAnchor(a.id); }
function fmt(v: number): string { return Number(v).toFixed(2); }
</script>
