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
  <footer class="bg-secondary-950 text-white/80 mt-20">
    <div class="container mx-auto px-4 py-12">
      <div class="grid gap-10 md:grid-cols-[1.4fr_2fr]">
        <div>
          <img :src="brand.logo" :alt="brand.name" class="h-12 w-auto mb-3">
          <p class="text-sm">{{ data.blurb }}</p>
        </div>
        <div class="grid gap-8 sm:grid-cols-3">
          <div v-for="col in data.columns" :key="col.title">
            <h4 class="font-display text-white text-sm uppercase tracking-widest mb-3">{{ col.title }}</h4>
            <ul class="space-y-2 text-sm">
              <li v-for="l in col.links" :key="l.to">
                <a v-if="l.external" :href="l.to" target="_blank" rel="noopener" class="hover:text-white">{{ l.label }}</a>
                <NuxtLink v-else :to="l.to" class="hover:text-white">{{ l.label }}</NuxtLink>
              </li>
            </ul>
          </div>
        </div>
      </div>
      <div class="mt-10 pt-6 border-t border-white/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs">
        <p>
          {{ data.license.replace('CC BY-NC-SA 4.0.', '') }}
          <a :href="data.licenseUrl" target="_blank" rel="noopener" class="underline hover:text-white">CC BY-NC-SA 4.0</a>.
        </p>
        <div class="flex items-center gap-4">
          <a v-for="s in data.social" :key="s.to" :href="s.to" :aria-label="s.label" target="_blank" rel="noopener" class="hover:text-white">
            <UIcon :name="s.icon" class="size-5" />
          </a>
        </div>
      </div>
    </div>
  </footer>
</template>
