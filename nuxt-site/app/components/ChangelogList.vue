<script setup lang="ts">
// The rulebook change notes, newest release first. Shared by the home page and /live.
defineProps<{
  releases: Array<{ version: string, released: string, items: string[] }>
}>()
</script>

<template>
  <div class="space-y-6">
    <div v-for="rel in releases" :key="rel.version" class="card-parchment p-6">
      <h3 class="font-display text-lg flex items-baseline gap-3">
        {{ rel.version }}
        <span class="font-serif text-sm muted">{{ rel.released }}</span>
      </h3>
      <hr class="rule-gold mt-3">
      <ul class="list-diamond mt-3 space-y-2 font-serif text-sm muted">
        <li v-for="(item, i) in rel.items" :key="i"><RichText :text="item" /></li>
      </ul>
    </div>
  </div>
</template>
