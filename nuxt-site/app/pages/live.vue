<script setup lang="ts">
const channel = 'cannonsandcoastlines'

const parents = ['cannonsandcoastlines.com', 'www.cannonsandcoastlines.com', 'localhost']
const parentParams = parents.map(p => `parent=${p}`).join('&')
const embedUrl = `https://player.twitch.tv/?channel=${channel}&${parentParams}`
const channelUrl = `https://www.twitch.tv/${channel}`

useSeoMeta({
  title: 'Live Playtest — Cannons & Coastlines',
  description: 'Watch the first full playtest of Cannons & Coastlines — all seven factions, complete ruleset, live.',
  ogTitle: 'Live Playtest — Cannons & Coastlines',
  ogDescription: 'Watch the first full playtest of Cannons & Coastlines — all seven factions, complete ruleset, live.'
})
</script>

<template>
  <div>
    <header class="py-12 px-4 text-center text-white">
      <h1 class="font-display text-4xl md:text-5xl text-white">First Full Playtest — Live</h1>
      <p class="mt-3 text-white/80 max-w-2xl mx-auto">
        All seven factions. The full ruleset. Streaming live from the captain's table.
      </p>
    </header>

    <section class="px-4 pb-16">
      <div class="container mx-auto max-w-5xl">
        <div class="relative w-full overflow-hidden rounded-xl bg-black shadow-2xl" style="aspect-ratio: 16 / 9;">
          <iframe
            :src="embedUrl"
            title="Cannons & Coastlines — First Full Playtest"
            frameborder="0"
            allow="autoplay; fullscreen"
            allowfullscreen
            loading="lazy"
            class="absolute inset-0 h-full w-full"
          />
        </div>
        <p class="mt-4 text-sm text-white/60 text-center">
          Stream not loading? <a :href="channelUrl" target="_blank" rel="noopener" class="underline text-primary-300">Watch it on Twitch</a>.
        </p>
      </div>
    </section>

    <div class="text-center pb-12 text-sm text-white/60">
      <NuxtLink to="/" class="underline hover:text-white">← Back to home page</NuxtLink>
    </div>
  </div>
</template>
