<script setup lang="ts">
// The rulebook change notes. Shared by the home page and /live.
defineProps<{
  items: Array<{ icon: string, title: string, body: string }>
}>()
</script>

<template>
  <ul class="space-y-4">
    <li v-for="item in items" :key="item.title" class="rounded-2xl border border-white/10 bg-secondary-900/60 p-5 flex gap-4">
      <div class="size-10 shrink-0 rounded-lg bg-primary-500/15 text-primary-300 flex items-center justify-center">
        <UIcon :name="item.icon" class="size-5" />
      </div>
      <div>
        <h3 class="font-display text-lg text-white">{{ item.title }}</h3>
        <p class="mt-1 text-sm text-white/70">{{ item.body }}</p>
      </div>
    </li>
  </ul>
</template>
