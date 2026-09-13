<script setup lang="ts">
const { data: page } = await useAsyncData('home', () =>
  queryCollection('pages').where('stem', '=', 'pages/home').first()
)

if (!page.value) throw createError({ statusCode: 404, statusMessage: 'Home content missing' })

useSeoMeta({
  title: page.value.meta?.title,
  description: page.value.meta?.description,
  ogTitle: page.value.meta?.title,
  ogDescription: page.value.meta?.description,
  ogImage: 'https://cannonsandcoastlines.com/assets/images/logo-with-wordmark.png',
  twitterCard: 'summary_large_image'
})

const p = computed(() => page.value!)
</script>

<template>
  <div>
    <!-- Hero -->
    <section class="band-sea relative flex items-center justify-center px-4 py-20 md:py-24 lg:min-h-[78vh] text-center">
      <HeroScene />
      <div class="relative z-10 max-w-3xl mx-auto" style="text-shadow: 0 2px 8px rgba(0,0,0,0.3);">
        <p class="font-display uppercase tracking-[0.25em] text-white/95 text-sm md:text-base mb-4">{{ p.hero.tagline }}</p>
        <hr class="rule-gold mx-auto w-32 mb-5">
        <img :src="p.hero.wordmark" alt="Cannons & Coastlines" class="mx-auto max-w-xl w-full mb-4" style="filter: drop-shadow(0 2px 12px rgba(0,0,0,0.4));">
        <p class="text-white/95 tracking-wider mb-3">{{ p.hero.subtitle }}</p>
        <p class="font-serif lead text-white/95 text-lg max-w-xl mx-auto mb-8">{{ p.hero.description }}</p>
        <div class="flex flex-wrap gap-3 justify-center">
          <UButton
            v-for="a in p.hero.actions"
            :key="a.label"
            :to="a.to"
            :icon="a.icon"
            :variant="a.variant === 'solid' ? 'solid' : 'ghost'"
            :color="a.variant === 'solid' ? 'primary' : 'neutral'"
            :class="a.variant === 'solid' ? '' : 'btn-ink'"
            size="xl"
          >
            {{ a.label }}
          </UButton>
        </div>
      </div>
    </section>

    <!-- Name vote -->
    <section v-if="p.nameVote" class="band-deck py-6 px-4">
      <div class="container mx-auto max-w-3xl text-center font-serif text-white/80 text-sm">
        <p>
          <span class="text-white/60">{{ p.nameVote.label }}</span>
          <strong class="text-white"> {{ p.nameVote.winner }}</strong>
          <strong class="text-primary-300">{{ p.nameVote.winnerPct }}%</strong>,
          <s>{{ p.nameVote.loser }}</s> {{ p.nameVote.loserPct }}%.
        </p>
        <div class="mt-3 h-2 rounded-sm border border-white/15 bg-black/30 overflow-hidden">
          <div class="h-full bg-primary-500" :style="{ width: p.nameVote.winnerPct + '%' }" />
        </div>
      </div>
    </section>

    <!-- See It -->
    <section id="see-it" class="py-20 px-4 container mx-auto">
      <SectionHeader :title="p.seeIt.title" :description="p.seeIt.description" />

      <div class="max-w-md mx-auto">
        <div class="rounded-sm overflow-hidden bg-black aspect-[3/4] border border-white/15">
          <iframe :src="p.seeIt.reel.embed" width="100%" height="100%" frameborder="0" scrolling="no" loading="lazy" title="Cannons & Coastlines Instagram reel" class="w-full h-full" />
        </div>
        <a :href="p.seeIt.reel.url" target="_blank" rel="noopener" class="mt-3 inline-flex items-center gap-2 text-primary-300 hover:text-primary-200 font-serif text-sm font-semibold">
          <UIcon name="i-lucide-instagram" /> {{ p.seeIt.reel.label }}
        </a>
      </div>

      <p class="mt-12 stamp stamp-gold">Printed pieces</p>
      <div class="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
        <figure v-for="ph in p.seeIt.photos" :key="ph.src" class="card-parchment overflow-hidden p-2">
          <img :src="ph.src" :alt="ph.alt" loading="lazy" class="w-full aspect-square object-cover border border-[#3a2f22]/30">
          <figcaption class="pt-2 text-xs muted">{{ ph.caption }}</figcaption>
        </figure>
      </div>

      <p class="mt-12 stamp stamp-gold">Playtest footage</p>
      <div class="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div v-for="src in p.seeIt.playtests" :key="src" class="aspect-video rounded-sm overflow-hidden bg-black border border-white/15">
          <iframe :src="src" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" loading="lazy" allowfullscreen class="w-full h-full" />
        </div>
      </div>
    </section>

    <!-- How It Plays -->
    <section id="how-it-plays" class="py-20 px-4 band-deck">
      <div class="container mx-auto">
        <SectionHeader :title="p.howItPlays.title" :description="p.howItPlays.description" />
        <div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div v-for="f in p.howItPlays.features" :key="f.title" class="card-parchment p-6">
            <div class="size-10 rounded-sm border border-[#3a2f22]/40 text-[#9a7526] flex items-center justify-center mb-4">
              <UIcon :name="f.icon" class="size-5" />
            </div>
            <h3 class="font-display text-lg">{{ f.title }}</h3>
            <p class="mt-2 text-sm muted">{{ f.body }}</p>
          </div>
        </div>
        <p class="mt-8 text-center font-serif text-white/70 text-sm">
          Everything else is in the
          <a :href="p.howItPlays.rulebookHref" class="underline text-primary-300 hover:text-primary-200">rulebook</a>.
        </p>
      </div>
    </section>

    <!-- Changelog / Playtest notes -->
    <section v-if="p.changelog" id="changelog" class="py-20 px-4">
      <div class="container mx-auto max-w-4xl">
        <SectionHeader :title="p.changelog.title" :description="p.changelog.description" />
        <div class="mt-2 mb-8 text-center">
          <span class="stamp stamp-gold">Rulebook {{ p.changelog.version }} · Released {{ p.changelog.released }}</span>
        </div>
        <ChangelogList :items="p.changelog.items" />
        <p class="mt-8 text-center font-serif text-white/60 text-sm">
          Full {{ p.changelog.version }} rules in the
          <a :href="p.howItPlays.rulebookHref" class="underline text-primary-300 hover:text-primary-200">rulebook</a>.
        </p>
      </div>
    </section>

    <!-- Factions -->
    <section id="factions" class="py-20 px-4 band-deck">
      <div class="container mx-auto">
      <SectionHeader :title="p.factions.title" :description="p.factions.description" />
      <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
        <FactionCard v-for="f in p.factions.items" :key="f.name" :faction="f" />
        </div>
      </div>
    </section>

    <!-- Signup -->
    <SignupSection :data="p.signup" />

    <!-- About -->
    <section id="about" class="py-20 px-4 band-deck">
      <div class="container mx-auto">
        <SectionHeader :title="p.about.title" />
        <div class="grid lg:grid-cols-2 gap-10">
          <div class="aspect-video rounded-sm overflow-hidden bg-black border border-white/15">
            <iframe :src="p.about.video" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" loading="lazy" allowfullscreen class="w-full h-full" />
          </div>
          <div class="space-y-4 font-serif lead text-white/80">
            <RichText v-for="(para, i) in p.about.paragraphs" :key="i" tag="p" :text="para" />
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
