<script setup lang="ts">
const { data: page } = await useAsyncData('privacy', () =>
  queryCollection('prose').path('/prose/privacy').first()
)

if (!page.value) throw createError({ statusCode: 404, statusMessage: 'Privacy policy missing' })

useSeoMeta({
  title: page.value.title,
  description: page.value.description
})
</script>

<template>
  <article class="container mx-auto max-w-3xl px-4 py-16">
    <ContentRenderer v-if="page" :value="page" />
    <p class="mt-10 text-sm text-white/60">
      <NuxtLink to="/" class="underline hover:text-white">← Back to main site</NuxtLink>
    </p>
  </article>
</template>
