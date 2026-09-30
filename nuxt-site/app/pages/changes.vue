<script setup lang="ts">
// /changes: what each rulebook update changed, newest first. The notes are
// content/pages/changes.yml. /live#changes and /playtest-2#changes end up
// here (see playtests.vue).
const { data: page } = await useAsyncData('changes', () =>
  queryCollection('pages').where('stem', '=', 'pages/changes').first()
)

if (!page.value) throw createError({ statusCode: 404, statusMessage: 'Rule changes missing' })

const p = computed(() => page.value!)

useSeoMeta({
  title: p.value.seo?.title,
  description: p.value.seo?.description,
  ogTitle: p.value.seo?.title,
  ogDescription: p.value.seo?.description
})
</script>

<template>
  <div>
    <header class="band-sea py-16 px-4 text-center text-ink">
      <div class="band-watermark"><UIcon name="i-lucide-scroll-text" /></div>
      <h1 class="font-display text-4xl md:text-5xl text-ink">{{ p.changelog.title }}</h1>
      <hr class="rule-gold my-5 mx-auto w-40">
      <p class="font-serif lead text-ink-soft max-w-2xl mx-auto">{{ p.changelog.description }}</p>
      <p class="mt-4 font-serif text-sm text-ink-soft">
        <NuxtLink to="/rulebook/pdf/rulebook.pdf" target="_blank" class="underline text-[color:var(--gold)]">Current rulebook (PDF)</NuxtLink>
        ·
        <NuxtLink to="/playtests" class="underline text-[color:var(--gold)]">Playtest recordings</NuxtLink>
      </p>
    </header>

    <section class="px-4 pb-8">
      <div class="container mx-auto max-w-4xl py-12">
        <ChangelogList :releases="p.changelog.releases" />
      </div>
    </section>

    <BackHome />
  </div>
</template>
