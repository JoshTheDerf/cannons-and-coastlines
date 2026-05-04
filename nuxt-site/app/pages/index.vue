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
    <section class="relative flex items-center justify-center overflow-hidden px-4 py-20 md:py-24 lg:min-h-[78vh] text-center" style="background: linear-gradient(180deg, #6b8c9a 0%, #5a8a9a 30%, #4a7a8a 60%, #3d6a7a 100%);">
      <HeroScene />
      <div class="relative z-10 max-w-3xl mx-auto" style="text-shadow: 0 2px 8px rgba(0,0,0,0.3);">
        <p class="font-display uppercase tracking-[0.25em] text-white/95 text-sm md:text-base mb-4">{{ p.hero.tagline }}</p>
        <img :src="p.hero.wordmark" alt="Cannons & Coastlines" class="mx-auto max-w-xl w-full mb-4" style="filter: drop-shadow(0 2px 12px rgba(0,0,0,0.4));">
        <p class="text-white/95 tracking-wider mb-3">{{ p.hero.subtitle }}</p>
        <p class="text-white/95 text-lg max-w-xl mx-auto mb-8">{{ p.hero.description }}</p>
        <div class="flex flex-wrap gap-3 justify-center">
          <UButton
            v-for="a in p.hero.actions"
            :key="a.label"
            :to="a.to"
            :icon="a.icon"
            :variant="a.variant"
            :color="a.variant === 'solid' ? 'primary' : 'neutral'"
            size="xl"
          >
            {{ a.label }}
          </UButton>
        </div>
      </div>
    </section>

    <!-- Name vote -->
    <section v-if="p.nameVote" class="bg-secondary-900 py-6 px-4 border-y border-white/10">
      <div class="container mx-auto max-w-3xl text-center text-white/80 text-sm">
        <p>
          <span class="text-white/60">{{ p.nameVote.label }}</span>
          <strong class="text-white"> {{ p.nameVote.winner }}</strong> won with
          <strong class="text-primary-300">{{ p.nameVote.winnerPct }}%</strong>
          over <s>{{ p.nameVote.loser }}</s> at {{ p.nameVote.loserPct }}%.
        </p>
        <div class="mt-3 h-2 rounded-full bg-white/10 overflow-hidden">
          <div class="h-full bg-primary-500" :style="{ width: p.nameVote.winnerPct + '%' }" />
        </div>
      </div>
    </section>

    <!-- See It -->
    <section id="see-it" class="py-20 px-4 container mx-auto">
      <SectionHeader :title="p.seeIt.title" :description="p.seeIt.description" />

      <div class="max-w-md mx-auto">
        <div class="rounded-xl overflow-hidden bg-black aspect-[3/4]">
          <iframe :src="p.seeIt.reel.embed" width="100%" height="100%" frameborder="0" scrolling="no" loading="lazy" title="Cannons & Coastlines Instagram reel" class="w-full h-full" />
        </div>
        <a :href="p.seeIt.reel.url" target="_blank" rel="noopener" class="mt-3 inline-flex items-center gap-2 text-primary-300 hover:text-primary-200 text-sm font-semibold">
          <UIcon name="i-lucide-instagram" /> {{ p.seeIt.reel.label }}
        </a>
      </div>

      <p class="mt-12 text-xs uppercase tracking-[0.3em] text-primary-300 font-semibold">Printed pieces</p>
      <div class="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
        <figure v-for="ph in p.seeIt.photos" :key="ph.src" class="rounded-lg overflow-hidden bg-secondary-900">
          <img :src="ph.src" :alt="ph.alt" loading="lazy" class="w-full aspect-square object-cover">
          <figcaption class="p-2 text-xs text-white/70">{{ ph.caption }}</figcaption>
        </figure>
      </div>

      <p class="mt-12 text-xs uppercase tracking-[0.3em] text-primary-300 font-semibold">Playtest footage</p>
      <div class="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div v-for="src in p.seeIt.playtests" :key="src" class="aspect-video rounded-lg overflow-hidden bg-black">
          <iframe :src="src" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" loading="lazy" allowfullscreen class="w-full h-full" />
        </div>
      </div>
    </section>

    <!-- How It Plays -->
    <section id="how-it-plays" class="py-20 px-4 bg-secondary-900/50">
      <div class="container mx-auto">
        <SectionHeader :title="p.howItPlays.title" :description="p.howItPlays.description" />
        <div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div v-for="f in p.howItPlays.features" :key="f.title" class="rounded-2xl border border-white/10 bg-secondary-900/60 p-6">
            <div class="size-10 rounded-lg bg-primary-500/15 text-primary-300 flex items-center justify-center mb-4">
              <UIcon :name="f.icon" class="size-5" />
            </div>
            <h3 class="font-display text-lg text-white">{{ f.title }}</h3>
            <p class="mt-2 text-sm text-white/70">{{ f.body }}</p>
          </div>
        </div>
        <p class="mt-8 text-center text-white/70 text-sm">
          Full rules, scoring, and diagrams in the
          <a :href="p.howItPlays.rulebookHref" class="underline text-primary-300 hover:text-primary-200">rulebook</a>.
        </p>
      </div>
    </section>

    <!-- Factions -->
    <section id="factions" class="py-20 px-4 container mx-auto">
      <SectionHeader :title="p.factions.title" :description="p.factions.description" />
      <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
        <FactionCard v-for="f in p.factions.items" :key="f.name" :faction="f" />
      </div>
    </section>

    <!-- Signup + Downloads (unified) -->
    <section id="signup" class="py-20 px-4 bg-secondary-900/50">
      <div class="container mx-auto grid lg:grid-cols-[1.4fr_1fr] gap-10">
        <div>
          <p class="text-xs uppercase tracking-[0.25em] text-primary-400 mb-2 font-semibold">{{ p.signup.eyebrow }}</p>
          <h2 class="font-display text-3xl text-white">{{ p.signup.title }}</h2>
          <p class="mt-3 text-white/70 max-w-xl">{{ p.signup.body }}</p>
          <ul v-if="p.signup.perks?.length" class="mt-5 space-y-2 text-sm text-white/85">
            <li v-for="perk in p.signup.perks" :key="perk" class="flex gap-2">
              <UIcon name="i-lucide-check" class="size-5 text-primary-300 shrink-0 mt-0.5" />
              <span>{{ perk }}</span>
            </li>
          </ul>
          <ClientOnly>
            <component :is="'script'" async :data-uid="p.signup.kitUid" :src="p.signup.kitSrc" />
          </ClientOnly>
          <p v-if="p.signup.publicRulebook" class="mt-4 text-sm text-white/70">
            <a :href="p.signup.publicRulebook.href" class="underline hover:text-primary-200">{{ p.signup.publicRulebook.label }}</a>
          </p>
          <p class="mt-3 text-xs text-white/50">
            <NuxtLink to="/privacy" class="underline">Privacy Policy</NuxtLink>
          </p>
        </div>
        <div class="self-start rounded-2xl border border-white/10 bg-secondary-900/60 p-6 flex gap-5 items-start">
          <div class="flex-1 min-w-0">
            <h3 class="font-display text-lg text-white">{{ p.signup.discord.title }}</h3>
            <p class="mt-2 text-sm text-white/70">{{ p.signup.discord.body }}</p>
            <UButton :to="p.signup.discord.url" target="_blank" icon="i-lucide-message-circle" color="primary" size="md" class="mt-4">
              Join the Discord
            </UButton>
          </div>
          <img :src="p.signup.discord.qr" alt="Discord invite QR" class="size-28 rounded-lg bg-white p-1 shrink-0">
        </div>
      </div>
    </section>

    <!-- About -->
    <section id="about" class="py-20 px-4 bg-secondary-900/50">
      <div class="container mx-auto">
        <SectionHeader :title="p.about.title" />
        <div class="grid lg:grid-cols-2 gap-10">
          <div class="aspect-video rounded-xl overflow-hidden bg-black">
            <iframe :src="p.about.video" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" loading="lazy" allowfullscreen class="w-full h-full" />
          </div>
          <div class="space-y-4 text-white/80">
            <RichText v-for="(para, i) in p.about.paragraphs" :key="i" tag="p" :text="para" />
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
