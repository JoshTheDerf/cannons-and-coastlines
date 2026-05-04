<script setup lang="ts">
defineProps<{
  title: string
  description?: string
  eyebrow?: string
  align?: 'left' | 'center'
}>()
</script>

<template>
  <div :class="['mb-10', (align ?? 'center') === 'center' ? 'text-center' : '']">
    <p v-if="eyebrow" class="text-xs uppercase tracking-[0.25em] text-primary-400 mb-2 font-semibold">{{ eyebrow }}</p>
    <h2 class="font-display text-3xl md:text-4xl text-white">{{ title }}</h2>
    <p v-if="description" class="mt-3 text-white/70 max-w-2xl mx-auto">{{ description }}</p>
  </div>
</template>
