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
  description: 'The first full playtest has wrapped. Subscribe or join the Discord to hear about the next one.',
  ogTitle: 'Live Playtest — Cannons & Coastlines',
  ogDescription: 'The first full playtest has wrapped. Subscribe or join the Discord to hear about the next one.'
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

    <SignupSection v-if="page?.signup" :data="page.signup" />

    <div class="text-center py-12 text-sm text-white/60">
      <NuxtLink to="/" class="underline hover:text-white">← Back to home page</NuxtLink>
    </div>
  </div>
</template>
