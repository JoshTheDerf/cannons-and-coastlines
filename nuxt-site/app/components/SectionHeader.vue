<script setup lang="ts">
defineProps<{
  title: string
  description?: string
  eyebrow?: string
  align?: 'left' | 'center'
  /** `sm` is the in-page subsection size used on content pages. */
  size?: 'sm' | 'lg'
}>()
</script>

<template>
  <div :class="['mb-8', (align ?? 'center') === 'center' ? 'text-center' : '']">
    <p v-if="eyebrow" class="text-xs uppercase tracking-[0.25em] text-primary-400 mb-2 font-semibold">{{ eyebrow }}</p>
    <h2 :class="['font-display text-white', size === 'sm' ? 'text-2xl' : 'text-3xl md:text-4xl']">{{ title }}</h2>
    <p
      v-if="description"
      :class="['text-white/70', size === 'sm' ? 'mt-2 max-w-3xl' : 'mt-3 max-w-2xl', (align ?? 'center') === 'center' ? 'mx-auto' : '']"
    >{{ description }}</p>
  </div>
</template>
