<script setup lang="ts">
const { data: page } = await useAsyncData('terms', () =>
  queryCollection('prose').path('/prose/terms').first()
)

if (!page.value) throw createError({ statusCode: 404, statusMessage: 'Terms missing' })

useSeoMeta({
  title: page.value.title,
  description: page.value.description
})
</script>

<template>
  <article class="container mx-auto max-w-3xl px-4 py-16">
    <ContentRenderer v-if="page" :value="page" />
    <p class="mt-10 text-sm text-ink-soft">
      <NuxtLink to="/" class="underline hover:text-ink">← Back to main site</NuxtLink>
    </p>
  </article>
</template>
