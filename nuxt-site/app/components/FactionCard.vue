<script setup lang="ts">
// A base-game fleet on the home page: picture, stats, the passive ability
// and a link to its printable faction card.
defineProps<{
  faction: {
    name: string
    image: string
    summary: string
    stats: Array<[string, string]>
    ability: string
    abilityBody: string
    card?: string
  }
}>()
</script>

<template>
  <article class="card-parchment p-6 flex flex-col">
    <div class="aspect-[2/1] flex items-center justify-center mb-5">
      <img :src="faction.image" :alt="faction.name" loading="lazy" class="max-h-full max-w-full object-contain">
    </div>
    <h3 class="font-display text-2xl">{{ faction.name }}</h3>
    <p class="mt-1 font-serif text-ink-soft">{{ faction.summary }}</p>
    <dl class="mt-4 grid grid-cols-2 gap-x-6 text-sm font-serif border-t border-[color:var(--rule)]">
      <div v-for="[k, v] in faction.stats" :key="k" class="flex justify-between gap-3 py-1.5 border-b border-[color:var(--rule)]/60">
        <dt class="text-ink-faint">{{ k }}</dt>
        <dd class="text-ink font-semibold text-right">{{ v }}</dd>
      </div>
    </dl>
    <p class="callout mt-4 text-sm flex-1"><strong>{{ faction.ability }}.</strong> {{ faction.abilityBody }}</p>
    <UButton
      v-if="faction.card"
      :to="faction.card"
      icon="i-lucide-download"
      variant="ghost"
      color="neutral"
      size="sm"
      class="btn-ink mt-5 self-start"
      target="_blank"
    >
      Faction card (PDF)
    </UButton>
  </article>
</template>
