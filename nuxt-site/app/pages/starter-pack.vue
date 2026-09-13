<script setup lang="ts">
const { data: page } = await useAsyncData('starter-pack', () =>
  queryCollection('pages').where('stem', '=', 'pages/starter-pack').first()
)

if (!page.value) throw createError({ statusCode: 404, statusMessage: 'Starter pack content missing' })

useSeoMeta({
  title: page.value.meta?.title,
  description: page.value.meta?.description,
})

const p = computed(() => page.value!)
</script>

<template>
  <div>
    <!-- Hero -->
    <header
      class="band-sea relative py-24 md:py-32 px-4 text-center text-ink min-h-[60vh] flex items-center justify-center"
      style="background-image: linear-gradient(180deg, rgba(51,38,27,0.88) 0%, rgba(26,19,13,0.94) 100%), url('/assets/photos/starter-pack/both-ships-and-background-sm.jpg'); background-size: cover; background-position: center;"
    >
      <div class="band-watermark"><UIcon name="i-lucide-compass" /></div>
      <div class="max-w-2xl mx-auto" style="text-shadow: 0 2px 12px rgba(0,0,0,0.45);">
      <span class="stamp text-error-300">
        <UIcon name="i-lucide-ban" class="size-3.5" /> {{ p.hero.badge }}
      </span>
      <h1 class="font-display text-4xl md:text-5xl text-ink mt-4">
        <s v-if="p.hero.strike" class="text-ink-faint">{{ p.hero.title }}</s>
        <template v-else>{{ p.hero.title }}</template>
      </h1>
      <hr class="rule-gold my-5 mx-auto w-40">
      <p class="font-serif lead text-lg text-ink">{{ p.hero.headline }}</p>
      <RichText tag="p" :text="p.hero.subtitle" class="mt-3 max-w-3xl mx-auto font-serif text-ink-soft" />
      <UButton :to="p.hero.cta.to" :icon="p.hero.cta.icon" color="primary" size="xl" class="mt-6">
        {{ p.hero.cta.label }}
      </UButton>
      </div>
    </header>

    <!-- Story -->
    <section class="py-16 px-4">
      <div class="container mx-auto grid lg:grid-cols-[1.4fr_1fr] gap-10">
        <div>
          <h2 class="font-display text-2xl text-ink">{{ p.story.title }}</h2>
          <hr class="rule-gold mt-4 max-w-xs">
          <div class="mt-4 space-y-4 font-serif lead text-ink-soft">
            <RichText v-for="(para, i) in p.story.paragraphs" :key="i" tag="p" :text="para" />
          </div>
        </div>
        <aside class="rounded-sm overflow-hidden bg-black border border-ink/25 aspect-[3/4] max-w-sm w-full lg:justify-self-end">
          <iframe :src="p.story.reelEmbed" width="100%" height="100%" frameborder="0" scrolling="no" loading="lazy" title="Cannons & Coastlines reel" class="w-full h-full" />
        </aside>
      </div>
    </section>

    <!-- Contents -->
    <section class="py-16 px-4 band-parchment">
      <div class="container mx-auto">
        <h2 class="font-display text-2xl text-ink">{{ p.contents.title }}</h2>
        <hr class="rule-gold mt-3 max-w-xs">
        <p class="mt-3 font-serif lead text-ink-soft">{{ p.contents.lead }}</p>

        <div class="mt-8 grid sm:grid-cols-2 gap-6">
          <figure v-for="s in p.contents.showcase" :key="s.src" class="card-parchment overflow-hidden p-2">
            <img :src="s.src" :alt="s.alt" loading="lazy" class="w-full aspect-[4/3] object-cover border border-[#3a2f22]/30">
            <figcaption class="pt-2 px-1 text-sm muted">{{ s.caption }}</figcaption>
          </figure>
        </div>

        <div class="mt-8 grid md:grid-cols-2 gap-5">
          <div v-for="inc in p.contents.includes" :key="inc.title" class="card-parchment p-6">
            <h3 class="font-display text-lg flex items-center gap-2">
              <UIcon :name="inc.icon" class="size-5 text-[#9a7526]" /> {{ inc.title }}
            </h3>
            <hr class="rule-gold mt-3">
            <ul class="list-diamond mt-3 space-y-2 text-sm">
              <li v-for="(it, i) in inc.items" :key="i">
                <RichText :text="it" />
              </li>
            </ul>
          </div>
        </div>

        <figure class="card-parchment mt-10 overflow-hidden p-2">
          <img :src="p.contents.wide.src" :alt="p.contents.wide.alt" loading="lazy" class="w-full border border-[#3a2f22]/30">
          <figcaption class="pt-2 px-1 text-sm muted">{{ p.contents.wide.caption }}</figcaption>
        </figure>

        <p class="mt-6 font-serif text-sm text-ink-soft italic">{{ p.contents.note }}</p>
      </div>
    </section>

    <!-- Form -->
    <section id="order" class="py-16 px-4">
      <div class="container mx-auto max-w-3xl">
        <h2 class="font-display text-2xl text-ink">{{ p.form.title }}</h2>
        <hr class="rule-gold mt-3 max-w-xs">
        <RichText tag="p" :text="p.form.intro" class="mt-3 font-serif lead text-ink-soft" />
        <div class="mt-6 rounded-sm overflow-hidden bg-white border border-[#3a2f22]/50">
          <iframe :src="p.form.embed" title="Starter Pack Form" loading="lazy" class="w-full h-[1200px]">Loading form…</iframe>
        </div>
        <p class="mt-3 font-serif text-sm text-ink-soft">
          Form not loading?
          <a :href="p.form.fallback" target="_blank" rel="noopener" class="underline text-[color:var(--gold)]">Open it in a new tab</a>.
        </p>
      </div>
    </section>

    <!-- Donate -->
    <section class="py-16 px-4">
      <div class="container mx-auto grid md:grid-cols-[1.2fr_1fr] gap-8 items-center">
        <div>
          <h2 class="font-display text-2xl text-ink">{{ p.donate.title }}</h2>
          <hr class="rule-gold mt-3 max-w-xs">
          <p class="mt-3 font-serif lead text-ink-soft">{{ p.donate.body }}</p>
          <UButton :to="p.donate.cta.url" target="_blank" :icon="p.donate.cta.icon" color="primary" size="xl" class="mt-5">{{ p.donate.cta.label }}</UButton>
        </div>
        <figure class="card-parchment overflow-hidden p-2">
          <img :src="p.donate.image.src" :alt="p.donate.image.alt" loading="lazy" class="w-full aspect-square object-cover border border-[#3a2f22]/30">
          <figcaption class="pt-2 px-1 text-sm muted">{{ p.donate.image.caption }}</figcaption>
        </figure>
      </div>
    </section>

    <BackHome />
  </div>
</template>
