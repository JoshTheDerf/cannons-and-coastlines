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
  <div class="card-parchment p-5 flex flex-col">
    <div v-if="faction.badge" class="flex items-center justify-between mb-3">
      <span class="stamp text-[#7a5316]">{{ faction.badge }}</span>
    </div>
    <div class="aspect-[4/3] flex items-center justify-center mb-3 rounded-sm overflow-hidden border border-[#3a2f22]/25 bg-[#e3d4b6]">
      <img :src="faction.image" :alt="faction.name" loading="lazy" class="max-h-full max-w-full object-contain">
    </div>
    <h3 class="font-display text-xl">{{ faction.name }}</h3>
    <p v-if="faction.tagline" class="font-serif text-sm font-semibold text-[#7a5316] mb-2">{{ faction.tagline }}</p>
    <hr class="rule-gold mb-3">
    <ul v-if="faction.stats?.length" class="list-diamond text-sm muted space-y-1 mb-3">
      <li v-for="s in faction.stats" :key="s">{{ s }}</li>
    </ul>
    <p class="text-sm flex-1">{{ faction.desc }}</p>
    <div v-if="faction.price" class="mt-3 stamp text-[#3f6b3f]">{{ faction.price }}</div>
    <UButton
      v-if="faction.card"
      :to="faction.card"
      icon="i-lucide-download"
      variant="ghost"
      color="neutral"
      size="sm"
      class="btn-ink mt-3 self-start"
      target="_blank"
    >
      Faction Card PDF
    </UButton>
  </div>
</template>
