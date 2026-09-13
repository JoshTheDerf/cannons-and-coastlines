<script setup lang="ts">
const props = defineProps<{
  title: string
  description?: string
  eyebrow?: string
  align?: 'left' | 'center'
  /** `sm` is the in-page subsection size used on content pages. */
  size?: 'sm' | 'lg'
  /** `ink` is for headers sitting on a parchment band. */
  tone?: 'light' | 'ink'
}>()

const centered = computed(() => (props.align ?? 'center') === 'center')
const ink = computed(() => props.tone === 'ink')
</script>

<template>
  <div :class="['mb-8', centered ? 'text-center' : '']">
    <!-- Ornament: a gold hairline broken by a diamond, in place of a bare heading. -->
    <div :class="['flex items-center gap-3 mb-3', centered ? 'justify-center' : '']">
      <span v-if="centered" class="rule-gold w-10 sm:w-16 shrink" />
      <UIcon name="i-lucide-anchor" class="size-4 shrink-0 text-[color:var(--gold)]" />
      <span class="rule-gold w-10 sm:w-16 shrink" />
    </div>
    <p
      v-if="eyebrow"
      :class="['stamp mb-3', 'stamp-gold']"
    >{{ eyebrow }}</p>
    <h2
      :class="[
        'font-display',
        'text-ink',
        size === 'sm' ? 'text-2xl' : 'text-3xl md:text-4xl'
      ]"
    >{{ title }}</h2>
    <p
      v-if="description"
      :class="[
        'font-serif lead',
        'text-ink-soft',
        size === 'sm' ? 'mt-2 max-w-3xl' : 'mt-3 max-w-2xl',
        centered ? 'mx-auto' : ''
      ]"
    >{{ description }}</p>
  </div>
</template>
