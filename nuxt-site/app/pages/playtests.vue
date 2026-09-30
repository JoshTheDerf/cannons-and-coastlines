<script setup lang="ts">
// /playtests: both playtest recordings, newest first, plus stills and clips
// from playtest #2 and what changed in between. The copy is
// content/pages/playtests.yml. /playtest-2 and /live redirect here, and the
// full rule changes are their own page (/changes).
import { FLEETS, fleetPage } from '#shared/utils/fleets'

type Playtest = { id: string, title: string, when: string, lead: string, video: string, start?: number, note?: string }
type GalleryItem = { clip?: string, src?: string, alt: string }

const [{ data: page }, { data: home }] = await Promise.all([
  useAsyncData('playtests', () => queryCollection('pages').where('stem', '=', 'pages/playtests').first()),
  useAsyncData('home', () => queryCollection('pages').where('stem', '=', 'pages/home').first())
])

if (!page.value) throw createError({ statusCode: 404, statusMessage: 'Playtests page missing' })

const p = computed(() => page.value!)
const playtests = computed(() => (p.value.playtests ?? []) as Playtest[])
const gallery = computed(() => (p.value.gallery?.items ?? []) as GalleryItem[])

const channelUrl = 'https://www.twitch.tv/cannonsandcoastlines'
const embedUrl = (t: Playtest) => `https://www.youtube.com/embed/${t.video}${t.start ? `?start=${t.start}` : ''}`
const watchUrl = (t: Playtest) => `https://youtu.be/${t.video}${t.start ? `?t=${t.start}` : ''}`

useSeoMeta({
  title: p.value.seo?.title,
  description: p.value.seo?.description,
  ogTitle: p.value.seo?.title,
  ogDescription: p.value.seo?.description,
  ogImage: 'https://cannonsandcoastlines.com/assets/photos/playtest-2/table-wide.jpg'
})

// The changelog used to live at /live#changes and /playtest-2#changes. Those
// redirect here with the fragment kept (a server redirect can't see it), so
// hop the rest of the way.
const route = useRoute()
onMounted(() => {
  if (route.hash === '#changes') navigateTo('/changes', { replace: true })
})
</script>

<template>
  <div>
    <header class="band-sea py-16 px-4 text-center text-ink">
      <div class="band-watermark"><UIcon name="i-lucide-anchor" /></div>
      <h1 class="font-display text-4xl md:text-5xl text-ink">{{ p.hero.title }}</h1>
      <hr class="rule-gold my-5 mx-auto w-40">
      <p class="font-serif lead text-ink-soft max-w-2xl mx-auto">{{ p.hero.lead }}</p>
      <nav class="mt-6 flex flex-wrap justify-center gap-2 text-sm" aria-label="On this page">
        <a
          v-for="t in playtests"
          :key="t.id"
          :href="`#${t.id}`"
          class="px-3 py-1 rounded-full border border-[color:var(--rule)] text-ink-soft hover:text-ink hover:border-ink/50"
        >{{ t.title }}</a>
        <NuxtLink to="/changes" class="px-3 py-1 rounded-full border border-[color:var(--rule)] text-ink-soft hover:text-ink hover:border-ink/50">
          Rule changes
        </NuxtLink>
      </nav>
    </header>

    <template v-for="(t, i) in playtests" :key="t.id">
      <section :id="t.id" class="px-4 py-14 scroll-mt-20">
        <div class="container mx-auto max-w-5xl">
          <div class="max-w-3xl">
            <span class="stamp stamp-gold">{{ t.when }}</span>
            <h2 class="mt-3 font-display text-3xl md:text-4xl text-ink">{{ t.title }}</h2>
            <p class="mt-3 font-serif lead text-ink-soft">{{ t.lead }}</p>
          </div>
          <div class="mt-6 relative w-full overflow-hidden rounded-sm bg-black border border-ink/25 shadow-2xl" style="aspect-ratio: 16 / 9;">
            <iframe
              :src="embedUrl(t)"
              :title="`Cannons & Coastlines: ${t.title} recording`"
              frameborder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              referrerpolicy="strict-origin-when-cross-origin"
              allowfullscreen
              :loading="i === 0 ? undefined : 'lazy'"
              class="absolute inset-0 h-full w-full"
            />
          </div>
          <p class="mt-4 font-serif text-sm text-ink-soft text-center">
            <template v-if="t.note">{{ t.note }} </template>
            Video not loading? <a :href="watchUrl(t)" target="_blank" rel="noopener" class="underline text-[color:var(--gold)]">Watch it on YouTube</a>.
            The full stream is on <a :href="channelUrl" target="_blank" rel="noopener" class="underline text-[color:var(--gold)]">Twitch</a>.
          </p>
          <p v-if="i > 0" class="mt-2 font-serif text-sm text-ink-soft text-center">
            The rules have changed since this game. <NuxtLink to="/changes" class="underline text-[color:var(--gold)]">Here's what changed</NuxtLink>, update by update.
          </p>
        </div>
      </section>

      <!-- After playtest #2: stills and clips from it, then what changed since the first one. -->
      <template v-if="i === 0">
        <section v-if="gallery.length" class="px-4 pb-14">
          <div class="container mx-auto max-w-5xl">
            <h3 class="font-display text-2xl text-ink">{{ p.gallery.title }}</h3>
            <div class="mt-5 grid gap-4 grid-cols-2 md:grid-cols-3">
              <figure v-for="g in gallery" :key="g.clip ?? g.src" class="photo-frame">
                <LoopClip v-if="g.clip" :src="g.clip" :alt="g.alt" class="block w-full aspect-[4/5] object-cover" />
                <img v-else :src="g.src" :alt="g.alt" loading="lazy" decoding="async" width="720" height="900" class="w-full h-auto aspect-[4/5] object-cover">
              </figure>
            </div>
          </div>
        </section>

        <section class="px-4 band-parchment">
          <div class="container mx-auto max-w-4xl py-16 grid gap-14">
            <div>
              <h2 class="font-display text-3xl md:text-4xl text-ink">{{ p.contents.rulesTitle }}</h2>
              <p class="mt-3 font-serif lead text-ink-soft">{{ p.contents.rulesLead }}</p>
              <ul class="mt-6 space-y-3 font-serif text-ink-soft list-disc pl-5">
                <RichText v-for="(item, j) in p.contents.rules" :key="j" tag="li" :text="item" />
              </ul>
              <p class="mt-6 font-serif text-sm text-ink-soft">
                The full rules are in the <NuxtLink to="/rulebook/pdf/rulebook.pdf" target="_blank" class="underline text-[color:var(--gold)]">v0.6 rulebook</NuxtLink>,
                and every change is on the <NuxtLink to="/changes" class="underline text-[color:var(--gold)]">rule changes page</NuxtLink>, release by release.
              </p>
            </div>

            <div>
              <h2 class="font-display text-3xl md:text-4xl text-ink">{{ p.contents.kitTitle }}</h2>
              <p class="mt-3 font-serif lead text-ink-soft">{{ p.contents.kitLead }}</p>
              <ul class="mt-6 space-y-3 font-serif text-ink-soft list-disc pl-5">
                <RichText v-for="(item, j) in p.contents.kit" :key="j" tag="li" :text="item" />
              </ul>
              <div class="mt-8 flex flex-wrap justify-center gap-x-4 gap-y-6">
                <figure v-for="f in FLEETS" :key="f.id" class="text-center w-[calc(50%-0.5rem)] md:w-[calc(25%-0.75rem)]">
                  <NuxtLink :to="fleetPage(f)" class="block group">
                    <img :src="f.image" :alt="f.name" loading="lazy" class="w-full aspect-[4/3] object-contain">
                    <figcaption class="mt-1 font-display text-ink group-hover:text-[color:var(--heading)]">{{ f.name }}</figcaption>
                  </NuxtLink>
                  <FilesButtons :fleet="f.id" size="xs" class="mt-2 justify-center" />
                </figure>
              </div>
            </div>
          </div>
        </section>
      </template>
    </template>

    <SignupSection v-if="home?.signup" :data="home.signup" />

    <div class="pt-12"><BackHome /></div>
  </div>
</template>
