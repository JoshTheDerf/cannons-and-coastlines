<script setup lang="ts">
const { data: page } = await useAsyncData('home-signup', () =>
  queryCollection('pages').where('stem', '=', 'pages/home').first()
)

const channel = 'cannonsandcoastlines'
const channelUrl = `https://www.twitch.tv/${channel}`

const videoId = 'xrnoY0tmqjc'
const gameplayStartSeconds = 760
const recordingEmbedUrl = `https://www.youtube.com/embed/${videoId}?start=${gameplayStartSeconds}`

useSeoMeta({
  title: 'Live Playtest — Cannons & Coastlines',
  description: 'Recap and rule changes from the first full faction playtest. Subscribe or join the Discord to hear about the next one.',
  ogTitle: 'Live Playtest — Cannons & Coastlines',
  ogDescription: 'Recap and rule changes from the first full faction playtest. Subscribe or join the Discord to hear about the next one.'
})
</script>

<template>
  <div>
    <header class="py-16 px-4 text-center text-white">
      <span class="inline-block rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-white/80">
        Event ended
      </span>
      <h1 class="mt-4 font-display text-4xl md:text-5xl text-white">The first full playtest has wrapped</h1>
      <p class="mt-4 text-white/80 max-w-2xl mx-auto">
        Thanks to everyone who tuned in. Subscribe or join the Discord below and we'll let you know
        when the next playtest goes live. Past streams stay up on
        <a :href="channelUrl" target="_blank" rel="noopener" class="underline text-primary-300">Twitch</a>.
      </p>
    </header>

    <section class="px-4 pb-16">
      <div class="container mx-auto max-w-5xl">
        <div class="relative w-full overflow-hidden rounded-xl bg-black shadow-2xl" style="aspect-ratio: 16 / 9;">
          <iframe
            :src="recordingEmbedUrl"
            title="Cannons & Coastlines — First Full Playtest Recording"
            frameborder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowfullscreen
            loading="lazy"
            class="absolute inset-0 h-full w-full"
          />
        </div>
        <p class="mt-4 text-sm text-white/60 text-center">
          Gameplay starts around 12:40 — the embed above is queued to jump straight there.
        </p>
      </div>
    </section>

    <!-- Playtest takeaways -->
    <section v-if="page?.changelog" class="px-4 pb-20 bg-secondary-900/30">
      <div class="container mx-auto max-w-4xl py-16">
        <SectionHeader
          :title="`What we changed: ${page.changelog.version}`"
          :description="page.changelog.description"
        />
        <ul class="mt-6 space-y-4">
          <li
            v-for="item in page.changelog.items"
            :key="item.title"
            class="rounded-2xl border border-white/10 bg-secondary-900/60 p-5 flex gap-4"
          >
            <div class="size-10 shrink-0 rounded-lg bg-primary-500/15 text-primary-300 flex items-center justify-center">
              <UIcon :name="item.icon" class="size-5" />
            </div>
            <div>
              <h3 class="font-display text-lg text-white">{{ item.title }}</h3>
              <p class="mt-1 text-sm text-white/70">{{ item.body }}</p>
            </div>
          </li>
        </ul>
        <p class="mt-8 text-center text-white/60 text-sm">
          All of it lives in the
          <NuxtLink to="/rulebook/pdf/rulebook.pdf" class="underline text-primary-300 hover:text-primary-200">rulebook PDF</NuxtLink>.
          Subscribe below to get the booklet drop the next time we revise.
        </p>
      </div>
    </section>

    <SignupSection v-if="page?.signup" :data="page.signup" />

    <div class="text-center py-12 text-sm text-white/60">
      <NuxtLink to="/" class="underline hover:text-white">← Back to home page</NuxtLink>
    </div>
  </div>
</template>
