<script setup lang="ts">
const { data: page } = await useAsyncData('home', () =>
  queryCollection('pages').where('stem', '=', 'pages/home').first()
)

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
    <header class="py-16 px-4 text-center text-white">
      <span class="inline-block rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-white/80">
        Event ended
      </span>
      <h1 class="mt-4 font-display text-4xl md:text-5xl text-white">The first full playtest is done</h1>
      <p class="mt-4 text-white/80 max-w-2xl mx-auto">
        Thanks for watching. Subscribe or join the Discord below to hear about the next one.
        Past streams stay up on
        <a :href="channelUrl" target="_blank" rel="noopener" class="underline text-primary-300">Twitch</a>.
      </p>
    </header>

    <section class="px-4 pb-16">
      <div class="container mx-auto max-w-5xl">
        <div class="relative w-full overflow-hidden rounded-xl bg-black shadow-2xl" style="aspect-ratio: 16 / 9;">
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
        <p class="mt-4 text-sm text-white/60 text-center">
          Gameplay starts at 12:40. The embed skips ahead for you.
        </p>
      </div>
    </section>

    <!-- Playtest takeaways -->
    <section v-if="page?.changelog" class="px-4 pb-20 bg-secondary-900/30">
      <div class="container mx-auto max-w-4xl py-16">
        <SectionHeader
          :title="`What changed in ${page.changelog.version}`"
          :description="page.changelog.description"
        />
        <ChangelogList :items="page.changelog.items" />
        <p class="mt-8 text-center text-white/60 text-sm">
          Full rules in the
          <NuxtLink to="/rulebook/pdf/rulebook.pdf" class="underline text-primary-300 hover:text-primary-200">rulebook PDF</NuxtLink>.
        </p>
      </div>
    </section>

    <SignupSection v-if="page?.signup" :data="page.signup" />

    <div class="pt-12"><BackHome /></div>
  </div>
</template>
