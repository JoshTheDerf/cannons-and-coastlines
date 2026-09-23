<script setup lang="ts">
import type { ShopProductCard } from '~/composables/useShop'

// One product on the shop index. Both ways to buy are priced on the tile,
// so a visitor can compare without opening every page.
const props = defineProps<{
  product: ShopProductCard
  kitLabel: string | null
  filesLabel: string | null
  stats?: string[]
}>()

const to = computed(() => `/shop/${props.product.handle}`)
const soon = (label: string | null) => label === 'Coming soon'
</script>

<template>
  <article class="group card-parchment overflow-hidden flex flex-col transition hover:-translate-y-0.5 hover:shadow-lg">
    <NuxtLink :to="to" class="relative block aspect-[16/10] tile-stage overflow-hidden">
      <img
        :src="product.featuredImage.url"
        :alt="product.featuredImage.altText"
        loading="lazy"
        class="absolute inset-0 w-full h-full transition duration-500 group-hover:scale-[1.04]"
        :class="product.featuredImage.url.endsWith('.jpg') ? 'object-cover' : 'object-contain p-3'"
      >
      <span
        v-if="product.kind === 'download'"
        class="absolute top-3 left-3 stamp stamp-gold bg-[color:var(--paper-card)]/90"
      >
        <UIcon name="i-lucide-download" class="size-3.5" /> Download
      </span>
    </NuxtLink>

    <div class="p-5 flex flex-col gap-2 flex-1">
      <p class="text-xs uppercase tracking-[0.2em] text-[color:var(--gold)] font-semibold">
        {{ product.kind === 'download' ? 'STL files' : product.group === 'base' ? 'Base game' : 'Add-on fleet' }}
      </p>
      <h3 class="font-display text-xl text-[color:var(--heading)]">
        <NuxtLink :to="to" class="after:absolute after:inset-0 relative">{{ product.title }}</NuxtLink>
      </h3>
      <p class="text-sm text-ink-soft">{{ product.tagline }}</p>
      <ul v-if="stats?.length" class="flex flex-wrap gap-1.5 mt-1">
        <li v-for="s in stats" :key="s" class="text-xs px-2 py-0.5 rounded-full bg-[color:var(--paper-tint)] text-ink-soft">{{ s }}</li>
      </ul>

      <dl class="mt-auto pt-4 grid gap-1.5 text-sm border-t border-[color:var(--rule)]/60">
        <div v-if="kitLabel" class="flex items-center justify-between">
          <dt class="text-ink-soft flex items-center gap-1.5"><UIcon name="i-lucide-package" class="size-4" /> Printed kit</dt>
          <dd :class="soon(kitLabel) ? 'text-ink-faint italic' : 'font-semibold text-ink'">{{ kitLabel }}</dd>
        </div>
        <div v-if="filesLabel" class="flex items-center justify-between">
          <dt class="text-ink-soft flex items-center gap-1.5"><UIcon name="i-lucide-download" class="size-4" /> STL files</dt>
          <dd :class="soon(filesLabel) ? 'text-ink-faint italic' : 'font-semibold text-ink'">{{ filesLabel }}</dd>
        </div>
      </dl>
    </div>
  </article>
</template>

<style scoped>
.tile-stage {
  background: radial-gradient(120% 90% at 50% 35%, #fbf7ee 0%, #efe6d3 65%, #e2d5bb 100%);
}
</style>
