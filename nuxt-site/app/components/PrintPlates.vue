<script setup lang="ts">
// One row per plate file (a color's parts, ready to slice): what's on it, a
// link that opens it in CubbySlicer, and the .3mf itself for the free ones.
// A paid plate on a list opened without the order key has no link.
defineProps<{
  plates: { file: string, label: string, swatch: string, what: string, plates: number, open: string | null, download: string | null }[]
}>()
</script>

<template>
  <ul v-if="plates.length" class="mt-2 border-y border-[color:var(--rule)] divide-y divide-[color:var(--rule)]/50 font-serif text-sm">
    <li v-for="p in plates" :key="p.file" class="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-2">
      <span class="inline-block size-3 shrink-0 self-center rounded-full ring-1 ring-black/25" :style="{ background: p.swatch }" />
      <span class="w-40 sm:w-52 shrink-0 font-semibold text-ink">{{ p.label }}</span>
      <span class="flex-1 min-w-40 text-ink-soft">{{ p.what }}<template v-if="p.plates > 1"> ({{ p.plates }} plates)</template></span>
      <span class="ml-auto whitespace-nowrap">
        <span v-if="!p.open" class="text-xs muted">Open it from your order page</span>
        <a v-else :href="p.open" target="_blank" rel="noopener" class="underline text-[color:var(--gold)]" :aria-label="`Open ${p.label} plate in CubbySlicer`">Open<UIcon name="i-lucide-square-arrow-out-up-right" class="ml-0.5 size-3.5 align-[-2px]" /></a>
        <a v-if="p.download" :href="p.download" download class="ml-3 text-xs text-ink-faint underline" :title="`Download ${p.file} (opens in OrcaSlicer too)`">.3mf</a>
      </span>
    </li>
  </ul>
</template>
