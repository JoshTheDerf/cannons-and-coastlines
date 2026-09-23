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
    <header class="band-sea py-16 px-4 text-center text-ink">
      <div class="band-watermark"><UIcon name="i-lucide-anchor" /></div>
      <span class="stamp stamp-gold">Event ended</span>
      <h1 class="mt-4 font-display text-4xl md:text-5xl text-ink">The first full playtest is done</h1>
      <hr class="rule-gold my-5 mx-auto w-40">
      <p class="font-serif lead text-ink-soft max-w-2xl mx-auto">
        Thanks for watching. Subscribe or join the Discord below to hear about the next one.
        Past streams stay up on
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

    <!-- Playtest takeaways -->
    <section v-if="page?.changelog" id="changes" class="px-4 pb-20 band-parchment">
      <div class="container mx-auto max-w-4xl py-16">
        <SectionHeader
          :title="page.changelog.title"
          :description="page.changelog.description"
        />
        <ChangelogList :releases="page.changelog.releases" />
        <p class="mt-8 text-center font-serif text-ink-soft text-sm">
          Full rules in the
          <NuxtLink to="/rulebook/pdf/rulebook.pdf" class="underline text-[color:var(--gold)] hover:text-[color:var(--heading)]">rulebook PDF</NuxtLink>.
        </p>
      </div>
    </section>

    <SignupSection v-if="page?.signup" :data="page.signup" />

    <div class="pt-12"><BackHome /></div>
  </div>
</template>
