<script setup lang="ts">
defineProps<{
  data: {
    blurb: string
    columns: Array<{ title: string, links: Array<{ label: string, to: string, external?: boolean }> }>
    social: Array<{ label: string, to: string, icon: string }>
    license: string
    licenseUrl: string
  }
  brand: { name: string, logo: string }
}>()
</script>

<template>
  <footer class="band-deck text-ink-soft mt-20">
    <div class="container mx-auto px-4 py-12">
      <div class="grid gap-10 md:grid-cols-[1.4fr_2fr]">
        <div>
          <img :src="brand.logo" :alt="brand.name" class="h-12 w-auto mb-3">
          <p class="font-serif text-sm">{{ data.blurb }}</p>
        </div>
        <div class="grid gap-8 sm:grid-cols-3">
          <div v-for="col in data.columns" :key="col.title">
            <h4 class="font-display text-ink text-sm uppercase tracking-widest">{{ col.title }}</h4>
            <hr class="rule-gold my-3">
            <ul class="space-y-2 text-sm">
              <li v-for="l in col.links" :key="l.to">
                <a v-if="l.external" :href="l.to" target="_blank" rel="noopener" class="hover:text-ink">{{ l.label }}</a>
                <NuxtLink v-else :to="l.to" class="hover:text-ink">{{ l.label }}</NuxtLink>
              </li>
            </ul>
          </div>
        </div>
      </div>
      <hr class="rule-gold mt-10">
      <div class="pt-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 font-serif text-sm">
        <p>
          {{ data.license.replace('CC BY-NC-SA 4.0.', '') }}
          <a :href="data.licenseUrl" target="_blank" rel="noopener" class="underline hover:text-ink">CC BY-NC-SA 4.0</a>.
        </p>
        <div class="flex items-center gap-4">
          <a v-for="s in data.social" :key="s.to" :href="s.to" :aria-label="s.label" target="_blank" rel="noopener" class="hover:text-ink">
            <UIcon :name="s.icon" class="size-5" />
          </a>
        </div>
      </div>
    </div>
  </footer>
</template>
