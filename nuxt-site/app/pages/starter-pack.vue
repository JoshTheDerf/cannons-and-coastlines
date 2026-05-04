<script setup lang="ts">
const { data: page } = await useAsyncData('starter-pack', () =>
  queryCollection('pages').where('stem', '=', 'pages/starter-pack').first()
)

if (!page.value) throw createError({ statusCode: 404, statusMessage: 'Starter pack content missing' })

useSeoMeta({
  title: page.value.meta?.title,
  description: page.value.meta?.description,
  ogTitle: `${page.value.meta?.title} — Sold Out | Cannons & Coastlines`,
  ogDescription: page.value.meta?.description
})

const p = computed(() => page.value!)
</script>

<template>
  <div>
    <!-- Hero -->
    <header
      class="relative py-24 md:py-32 px-4 text-center text-white min-h-[60vh] flex items-center justify-center"
      style="background: linear-gradient(135deg, rgba(28,50,70,0.72) 0%, rgba(20,40,58,0.78) 100%), url('/assets/photos/starter-pack/both-ships-and-background-sm.jpg') center/cover no-repeat;"
    >
      <div class="max-w-2xl mx-auto" style="text-shadow: 0 2px 12px rgba(0,0,0,0.45);">
      <span class="inline-flex items-center gap-2 rounded-full bg-error-500/20 text-error-300 border border-error-500/30 px-3 py-1 text-xs font-semibold uppercase tracking-wide">
        <UIcon name="i-lucide-ban" class="size-3.5" /> {{ p.hero.badge }}
      </span>
      <h1 class="font-display text-4xl md:text-5xl text-white mt-4">
        <s v-if="p.hero.strike" class="text-white/40">{{ p.hero.title }}</s>
        <template v-else>{{ p.hero.title }}</template>
      </h1>
      <p class="mt-4 text-lg text-white">{{ p.hero.headline }}</p>
      <RichText tag="p" :text="p.hero.subtitle" class="mt-3 max-w-3xl mx-auto text-white/75" />
      <UButton :to="p.hero.cta.to" :icon="p.hero.cta.icon" color="primary" size="xl" class="mt-6">
        {{ p.hero.cta.label }}
      </UButton>
      </div>
    </header>

    <!-- Story -->
    <section class="py-16 px-4">
      <div class="container mx-auto grid lg:grid-cols-[1.4fr_1fr] gap-10">
        <div>
          <h2 class="font-display text-2xl text-white">{{ p.story.title }}</h2>
          <div class="mt-4 space-y-4 text-white/80">
            <RichText v-for="(para, i) in p.story.paragraphs" :key="i" tag="p" :text="para" />
          </div>
        </div>
        <aside class="rounded-xl overflow-hidden bg-black aspect-[3/4] max-w-sm w-full lg:justify-self-end">
          <iframe :src="p.story.reelEmbed" width="100%" height="100%" frameborder="0" scrolling="no" loading="lazy" title="Cannons & Coastlines reel" class="w-full h-full" />
        </aside>
      </div>
    </section>

    <!-- Contents -->
    <section class="py-16 px-4 bg-secondary-900/50">
      <div class="container mx-auto">
        <h2 class="font-display text-2xl text-white">{{ p.contents.title }}</h2>
        <p class="mt-2 text-white/70">{{ p.contents.lead }}</p>

        <div class="mt-8 grid sm:grid-cols-2 gap-6">
          <figure v-for="s in p.contents.showcase" :key="s.src" class="rounded-xl overflow-hidden bg-secondary-900">
            <img :src="s.src" :alt="s.alt" loading="lazy" class="w-full aspect-[4/3] object-cover">
            <figcaption class="p-3 text-sm text-white/80">{{ s.caption }}</figcaption>
          </figure>
        </div>

        <div class="mt-8 grid md:grid-cols-2 gap-5">
          <div v-for="inc in p.contents.includes" :key="inc.title" class="rounded-2xl border border-white/10 bg-secondary-900/60 p-6">
            <h3 class="font-display text-lg text-white flex items-center gap-2">
              <UIcon :name="inc.icon" class="size-5 text-primary-300" /> {{ inc.title }}
            </h3>
            <ul class="mt-3 space-y-2 text-sm text-white/80">
              <li v-for="(it, i) in inc.items" :key="i" class="flex gap-2">
                <span class="text-primary-300">•</span>
                <RichText :text="it" />
              </li>
            </ul>
          </div>
        </div>

        <figure class="mt-10 rounded-xl overflow-hidden bg-secondary-900">
          <img :src="p.contents.wide.src" :alt="p.contents.wide.alt" loading="lazy" class="w-full">
          <figcaption class="p-3 text-sm text-white/70">{{ p.contents.wide.caption }}</figcaption>
        </figure>

        <p class="mt-6 text-sm text-white/60 italic">{{ p.contents.note }}</p>
      </div>
    </section>

    <!-- Form -->
    <section id="order" class="py-16 px-4 bg-primary-500/5">
      <div class="container mx-auto max-w-3xl">
        <h2 class="font-display text-2xl text-white">{{ p.form.title }}</h2>
        <RichText tag="p" :text="p.form.intro" class="mt-3 text-white/80" />
        <div class="mt-6 rounded-xl overflow-hidden bg-white">
          <iframe :src="p.form.embed" title="Starter Pack Form" loading="lazy" class="w-full h-[1200px]">Loading form…</iframe>
        </div>
        <p class="mt-3 text-sm text-white/60">
          Form not loading?
          <a :href="p.form.fallback" target="_blank" rel="noopener" class="underline text-primary-300">Open it in a new tab</a>.
        </p>
      </div>
    </section>

    <!-- Donate -->
    <section class="py-16 px-4">
      <div class="container mx-auto grid md:grid-cols-[1.2fr_1fr] gap-8 items-center">
        <div>
          <h2 class="font-display text-2xl text-white">{{ p.donate.title }}</h2>
          <p class="mt-3 text-white/80">{{ p.donate.body }}</p>
          <UButton :to="p.donate.cta.url" target="_blank" :icon="p.donate.cta.icon" color="primary" size="xl" class="mt-5">{{ p.donate.cta.label }}</UButton>
        </div>
        <figure class="rounded-xl overflow-hidden bg-secondary-900">
          <img :src="p.donate.image.src" :alt="p.donate.image.alt" loading="lazy" class="w-full aspect-square object-cover">
          <figcaption class="p-3 text-sm text-white/70">{{ p.donate.image.caption }}</figcaption>
        </figure>
      </div>
    </section>

    <div class="text-center pb-12 text-sm text-white/60">
      <NuxtLink to="/" class="underline hover:text-white">← Back to home page</NuxtLink>
    </div>
  </div>
</template>
