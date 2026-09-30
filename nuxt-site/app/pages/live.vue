<script setup lang="ts">
const channel = 'cannonsandcoastlines'
const channelUrl = `https://www.twitch.tv/${channel}`

const videoId = 'xrnoY0tmqjc'
const gameplayStartSeconds = 760
const recordingEmbedUrl = `https://www.youtube.com/embed/${videoId}?start=${gameplayStartSeconds}`

useSeoMeta({
  title: 'Live Playtest',
  description: 'Recording and rule changes from the first full playtest.'
})
</script>

<template>
  <div>
    <header class="band-sea py-16 px-4 text-center text-ink">
      <div class="band-watermark"><UIcon name="i-lucide-anchor" /></div>
      <span class="stamp stamp-gold">Event ended</span>
      <h1 class="mt-4 font-display text-4xl md:text-5xl text-ink">The first full playtest is done</h1>
      <hr class="rule-gold my-5 mx-auto w-40">
      <p class="font-serif lead text-ink-soft max-w-2xl mx-auto">
        This was the first full playtest, in May on rulebook v0.3. Past streams stay up on
        <a :href="channelUrl" target="_blank" rel="noopener" class="underline text-[color:var(--gold)]">Twitch</a>.
      </p>
    </header>

    <section class="px-4 pb-16">
      <div class="container mx-auto max-w-5xl">
        <div class="relative w-full overflow-hidden rounded-sm bg-black border border-ink/25 shadow-2xl" style="aspect-ratio: 16 / 9;">
          <iframe
            :src="recordingEmbedUrl"
            title="Cannons & Coastlines: First Full Playtest Recording"
            frameborder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowfullscreen
            loading="lazy"
            class="absolute inset-0 h-full w-full"
          />
        </div>
        <p class="mt-4 font-serif text-sm text-ink-soft text-center">
          Gameplay starts at 12:40. The embed skips ahead for you.
        </p>
      </div>
    </section>

    <!-- The rulebook change notes moved to /playtest-2; old #changes links land here. -->
    <section id="changes" class="px-4 pb-8">
      <p class="container mx-auto max-w-3xl text-center font-serif text-ink-soft">
        The rules have changed since this game. What changed in each update is on the
        <NuxtLink to="/playtest-2#changes" class="underline text-[color:var(--gold)]">playtest #2 page</NuxtLink>,
        and the <NuxtLink to="/playtest-2" class="underline text-[color:var(--gold)]">second playtest's recording</NuxtLink> is there too.
      </p>
    </section>

    <div class="pt-12"><BackHome /></div>
  </div>
</template>
