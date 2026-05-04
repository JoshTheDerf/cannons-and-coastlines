<script setup lang="ts">
defineProps<{
  faction: {
    badge?: string
    name: string
    image: string
    tagline?: string
    stats?: string[]
    desc: string
    price?: string
    card?: string
  }
}>()
</script>

<template>
  <div class="rounded-2xl border border-white/10 bg-secondary-900/60 p-5 flex flex-col">
    <div class="flex items-center justify-between mb-3">
      <span v-if="faction.badge" class="text-[10px] uppercase tracking-widest font-semibold text-primary-300 bg-primary-500/15 px-2 py-1 rounded">{{ faction.badge }}</span>
    </div>
    <div class="aspect-[4/3] flex items-center justify-center mb-3 bg-secondary-950/40 rounded-lg overflow-hidden">
      <img :src="faction.image" :alt="faction.name" loading="lazy" class="max-h-full max-w-full object-contain">
    </div>
    <h3 class="font-display text-xl text-white">{{ faction.name }}</h3>
    <p v-if="faction.tagline" class="text-primary-300 text-sm font-semibold mb-2">{{ faction.tagline }}</p>
    <ul v-if="faction.stats?.length" class="text-xs text-white/70 space-y-1 mb-3">
      <li v-for="s in faction.stats" :key="s">• {{ s }}</li>
    </ul>
    <p class="text-sm text-white/80 flex-1">{{ faction.desc }}</p>
    <div v-if="faction.price" class="mt-3 text-xs font-semibold uppercase tracking-wide text-success-400">{{ faction.price }}</div>
    <UButton
      v-if="faction.card"
      :to="faction.card"
      icon="i-lucide-download"
      variant="outline"
      color="primary"
      size="sm"
      class="mt-3 self-start"
      target="_blank"
    >
      Faction Card PDF
    </UButton>
  </div>
</template>
