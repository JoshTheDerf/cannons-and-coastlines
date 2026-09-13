<script setup lang="ts">
defineProps<{
  data: {
    pill: string
    headline: string
    extra?: string
    cta: string
    to: string
  }
}>()
</script>

<template>
  <aside class="band-announce">
    <NuxtLink :to="data.to" class="container mx-auto flex flex-wrap items-center gap-3 px-4 py-2 text-sm">
      <UIcon name="i-lucide-anchor" class="size-4" />
      <span class="stamp text-ink">{{ data.pill }}</span>
      <span class="flex-1">
        <strong>{{ data.headline }}</strong><span v-if="data.extra" class="hidden sm:inline">&nbsp;{{ data.extra }}</span>
      </span>
      <span class="inline-flex items-center gap-1 font-semibold">
        {{ data.cta }} <UIcon name="i-lucide-arrow-right" class="size-4" />
      </span>
    </NuxtLink>
  </aside>
</template>
