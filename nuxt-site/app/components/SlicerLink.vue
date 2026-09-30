<script setup lang="ts">
// A small "open in Cubby Slicer" icon link for a print list row. Renders
// nothing without a URL (a paid file on a list opened without an order key).
defineProps<{ to: string | null }>()
</script>

<template>
  <a
    v-if="to" :href="to" target="_blank" rel="noopener"
    class="ml-1 inline-flex align-middle text-[color:var(--gold)] hover:opacity-80"
    title="Open in Cubby Slicer" aria-label="Open in Cubby Slicer"
  ><UIcon name="i-lucide-square-arrow-out-up-right" class="size-3.5" /></a>
</template>
