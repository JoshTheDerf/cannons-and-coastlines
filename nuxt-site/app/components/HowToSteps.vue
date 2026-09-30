<script setup lang="ts">
// The numbered "How to do it" at the top of a print list (print-lists.yml
// `howTo`, links filled in by usePrintList).
defineProps<{ title: string, steps: string[] }>()
</script>

<template>
  <div class="card-parchment p-5 sm:p-6 text-left">
    <h2 class="font-display text-xl text-ink">{{ title }}</h2>
    <ol class="mt-3 grid gap-3 font-serif text-ink-soft">
      <li v-for="(step, i) in steps" :key="i" class="grid grid-cols-[1.75rem_1fr] gap-2 items-baseline">
        <span class="inline-flex size-6 items-center justify-center rounded-full bg-[color:var(--gold)] text-sm font-semibold text-[#1b1409]">{{ i + 1 }}</span>
        <RichText :text="step" class="how-to-step" />
      </li>
    </ol>
  </div>
</template>

<style scoped>
.how-to-step :deep(a) { color: var(--gold); }
</style>
