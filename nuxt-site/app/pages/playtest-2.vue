<script setup lang="ts">
const { data: page } = await useAsyncData('playtest-2', () =>
  queryCollection('pages').where('stem', '=', 'pages/playtest-2').first()
)
const { data: home } = await useAsyncData('home', () =>
  queryCollection('pages').where('stem', '=', 'pages/home').first()
)

if (!page.value) throw createError({ statusCode: 404, statusMessage: 'Playtest page missing' })

const p = computed(() => page.value!)

const channel = 'cannonsandcoastlines'
const channelUrl = `https://www.twitch.tv/${channel}`
// Twitch refuses to play inside a page whose host isn't listed as a parent.
const parents = ['cannonsandcoastlines.com', 'www.cannonsandcoastlines.com', 'localhost']
const host = useRequestURL().hostname
if (!parents.includes(host)) parents.push(host)
const embedUrl = `https://player.twitch.tv/?channel=${channel}&${parents.map(h => `parent=${h}`).join('&')}`

useSeoMeta({
  title: p.value.meta?.title,
  description: p.value.meta?.description,
  ogTitle: p.value.meta?.title,
  ogDescription: p.value.meta?.description
})
</script>

<template>
  <div>
    <header class="band-sea py-16 px-4 text-center text-ink">
      <div class="band-watermark"><UIcon name="i-lucide-anchor" /></div>
      <span class="stamp stamp-gold">{{ p.hero.stamp }}</span>
      <h1 class="mt-4 font-display text-4xl md:text-5xl text-ink">{{ p.hero.title }}</h1>
      <hr class="rule-gold my-5 mx-auto w-40">
      <p class="font-serif lead text-ink-soft max-w-2xl mx-auto">{{ p.hero.lead }}</p>
    </header>

    <section class="px-4 pb-16">
      <div class="container mx-auto max-w-5xl">
        <div class="relative w-full overflow-hidden rounded-sm bg-black border border-ink/25 shadow-2xl" style="aspect-ratio: 16 / 9;">
          <iframe
            :src="embedUrl"
            title="Cannons & Coastlines: Playtest #2 on Twitch"
            frameborder="0"
            allow="autoplay; fullscreen"
            allowfullscreen
            class="absolute inset-0 h-full w-full"
          />
        </div>
        <p class="mt-4 font-serif text-sm text-ink-soft text-center">
          Stream not loading? <a :href="channelUrl" target="_blank" rel="noopener" class="underline text-[color:var(--gold)]">Watch it on Twitch</a>.
          You can also watch the <NuxtLink to="/live" class="underline text-[color:var(--gold)]">first playtest's recording</NuxtLink>.
        </p>
      </div>
    </section>

    <section class="px-4 band-parchment">
      <div class="container mx-auto max-w-4xl py-16 grid gap-14">
        <div>
          <h2 class="font-display text-3xl md:text-4xl text-ink">{{ p.contents.rulesTitle }}</h2>
          <p class="mt-3 font-serif lead text-ink-soft">{{ p.contents.rulesLead }}</p>
          <ul class="mt-6 space-y-3 font-serif text-ink-soft list-disc pl-5">
            <RichText v-for="(item, i) in p.contents.rules" :key="i" tag="li" :text="item" />
          </ul>
          <p class="mt-6 font-serif text-sm text-ink-soft">
            The full rules are in the <NuxtLink to="/rulebook/pdf/rulebook.pdf" target="_blank" class="underline text-[color:var(--gold)]">v0.6 rulebook</NuxtLink>,
            and <a href="#changes" class="underline text-[color:var(--gold)]">every change is listed below</a>, release by release.
          </p>
        </div>

        <div>
          <h2 class="font-display text-3xl md:text-4xl text-ink">{{ p.contents.kitTitle }}</h2>
          <p class="mt-3 font-serif lead text-ink-soft">{{ p.contents.kitLead }}</p>
          <ul class="mt-6 space-y-3 font-serif text-ink-soft list-disc pl-5">
            <RichText v-for="(item, i) in p.contents.kit" :key="i" tag="li" :text="item" />
          </ul>
          <div class="mt-8 grid grid-cols-2 md:grid-cols-4 gap-4">
            <figure v-for="s in p.contents.ships" :key="s.name" class="text-center">
              <img :src="s.image" :alt="s.name" loading="lazy" class="w-full aspect-[4/3] object-contain">
              <figcaption class="mt-1 font-display text-ink">{{ s.name }}</figcaption>
            </figure>
          </div>
        </div>
      </div>
    </section>

    <section v-if="home?.changelog" id="changes" class="px-4 pb-20">
      <div class="container mx-auto max-w-4xl py-16">
        <SectionHeader :title="home.changelog.title" :description="home.changelog.description" />
        <ChangelogList :releases="home.changelog.releases" />
      </div>
    </section>

    <SignupSection v-if="home?.signup" :data="home.signup" />

    <div class="pt-12"><BackHome /></div>
  </div>
</template>
