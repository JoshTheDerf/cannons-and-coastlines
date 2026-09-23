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
const actionLetters = ['A', 'B', 'C']
</script>

<template>
  <div>
    <!-- Hero -->
    <section class="band-sea relative flex items-center justify-center px-4 pt-16 pb-40 md:pt-20 md:pb-48 lg:min-h-[80vh] text-center">
      <HeroScene />
      <div class="relative z-10 max-w-2xl mx-auto hero-copy">
        <h1 class="sr-only">Cannons &amp; Coastlines</h1>
        <img :src="p.hero.wordmark" alt="" class="mx-auto max-w-xl w-full" style="filter: drop-shadow(0 2px 12px rgba(0,0,0,0.45));">
        <p class="mt-3 font-display uppercase tracking-[0.2em] text-ink-soft text-sm md:text-base">{{ p.hero.tagline }}</p>
        <p class="mt-6 font-serif text-xl md:text-2xl text-ink leading-snug">{{ p.hero.description }}</p>
        <p class="mt-4 text-sm tracking-wide text-ink-soft">{{ p.hero.facts }}</p>
        <div class="mt-8 flex flex-wrap gap-3 justify-center">
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

    <!-- What it is -->
    <section id="what-it-is" class="py-20 px-4">
      <div class="container mx-auto grid gap-10 lg:grid-cols-[1.15fr_1fr] items-center">
        <div>
          <h2 class="font-display text-3xl md:text-4xl text-ink">{{ p.intro.title }}</h2>
          <div class="mt-5 space-y-4 font-serif lead text-ink-soft max-w-xl">
            <RichText v-for="(para, i) in p.intro.paragraphs" :key="i" tag="p" :text="para" />
          </div>
          <a :href="p.intro.reel.url" target="_blank" rel="noopener" class="mt-6 inline-flex items-center gap-2 font-serif font-semibold text-[color:var(--gold)] hover:text-[color:var(--heading)]">
            <UIcon name="i-lucide-instagram" /> {{ p.intro.reel.label }}
          </a>
        </div>
        <figure class="photo-frame max-w-md mx-auto lg:mx-0 lg:justify-self-end">
          <img :src="p.intro.photo.src" :alt="p.intro.photo.alt" class="w-full aspect-[5/6] object-cover">
        </figure>
      </div>
    </section>

    <!-- How to play -->
    <section id="how-to-play" class="py-20 px-4 band-parchment">
      <div class="container mx-auto">
        <div class="max-w-2xl">
          <h2 class="font-display text-3xl md:text-4xl text-ink">{{ p.howToPlay.title }}</h2>
          <p class="mt-3 font-serif lead text-ink-soft">{{ p.howToPlay.lead }}</p>
        </div>

        <ol class="mt-12 space-y-14">
          <li v-for="(step, n) in p.howToPlay.steps" :key="step.title" class="step">
            <div class="step-num" aria-hidden="true">{{ n + 1 }}</div>
            <div class="min-w-0">
              <h3 class="font-display text-2xl text-ink">{{ step.title }}</h3>
              <div class="mt-3 space-y-3 font-serif text-ink-soft">
                <RichText v-for="(para, i) in step.body" :key="i" tag="p" :text="para" />
              </div>

              <div v-if="step.actions" class="mt-5 grid gap-3 md:grid-cols-3">
                <div v-for="(a, i) in step.actions" :key="a.name" class="card-parchment p-4">
                  <p class="font-display text-lg text-ink">
                    <span class="text-[color:var(--gold)] mr-1">{{ actionLetters[i] }}.</span> {{ a.name }}
                  </p>
                  <p class="mt-1 text-sm muted">{{ a.body }}</p>
                </div>
              </div>

              <div v-if="step.coins" class="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
                <div v-for="c in step.coins" :key="c.name" class="flex items-center gap-3">
                  <img :src="c.image" :alt="`${c.name} coin`" loading="lazy" class="size-12 shrink-0 object-contain">
                  <p class="font-serif text-sm text-ink-soft"><strong class="text-ink">{{ c.name }}.</strong> {{ c.body }}</p>
                </div>
              </div>

              <RichText v-if="step.note" tag="p" :text="step.note" class="callout mt-5" />
            </div>

            <aside v-if="step.table || step.photo" class="step-aside space-y-5">
              <table v-if="step.table" class="rulebook text-sm">
                <thead>
                  <tr><th v-for="h in step.table.head" :key="h">{{ h }}</th></tr>
                </thead>
                <tbody>
                  <tr v-for="(row, r) in step.table.rows" :key="r">
                    <td v-for="(cell, c) in row" :key="c">{{ cell }}</td>
                  </tr>
                </tbody>
              </table>
              <figure v-if="step.photo" class="photo-frame">
                <img :src="step.photo.src" :alt="step.photo.alt" loading="lazy" class="w-full aspect-[4/3] object-cover">
              </figure>
            </aside>
          </li>
        </ol>

        <div class="mt-14 pt-8 border-t border-[color:var(--rule)] grid gap-6 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <p class="font-serif text-ink-soft max-w-2xl">{{ p.howToPlay.outro }}</p>
            <p class="mt-2 text-sm text-ink-faint">
              Rulebook {{ p.howToPlay.version }}.
              <NuxtLink :to="p.howToPlay.changesHref" class="underline">What changed</NuxtLink>
            </p>
          </div>
          <div class="flex flex-wrap gap-3">
            <UButton
              v-for="(r, i) in p.howToPlay.rulebook"
              :key="r.href"
              :to="r.href"
              :icon="r.icon"
              target="_blank"
              :color="i === 0 ? 'primary' : 'neutral'"
              :variant="i === 0 ? 'solid' : 'ghost'"
              :class="i === 0 ? '' : 'btn-ink'"
            >
              {{ r.label }}
            </UButton>
          </div>
        </div>
      </div>
    </section>

    <!-- Fleets -->
    <section id="fleets" class="py-20 px-4">
      <div class="container mx-auto">
        <div class="max-w-2xl">
          <h2 class="font-display text-3xl md:text-4xl text-ink">{{ p.fleets.title }}</h2>
          <p class="mt-3 font-serif lead text-ink-soft">{{ p.fleets.lead }}</p>
        </div>

        <div class="mt-10 grid gap-6 md:grid-cols-2">
          <FactionCard v-for="f in p.fleets.base" :key="f.name" :faction="f" />
        </div>

        <h3 class="mt-16 font-display text-2xl text-ink">{{ p.fleets.addonsTitle }}</h3>
        <p class="mt-2 font-serif text-ink-soft max-w-2xl">{{ p.fleets.addonsLead }}</p>
        <ul class="mt-6 divide-y divide-[color:var(--rule)] border-y border-[color:var(--rule)]">
          <li v-for="f in p.fleets.addons" :key="f.name" class="py-4 grid grid-cols-[5.5rem_1fr] sm:grid-cols-[7rem_1fr_auto] gap-4 items-center">
            <img :src="f.image" :alt="f.name" loading="lazy" class="w-full aspect-[4/3] object-contain">
            <div class="min-w-0">
              <p class="font-display text-lg text-ink">{{ f.name }}</p>
              <p class="text-sm text-ink-faint">{{ f.stats }}</p>
              <p class="mt-1 font-serif text-sm text-ink-soft">{{ f.body }}</p>
            </div>
            <a :href="f.card" target="_blank" class="col-start-2 sm:col-start-auto text-sm font-serif font-semibold underline text-[color:var(--gold)] hover:text-[color:var(--heading)] whitespace-nowrap">
              Faction card (PDF)
            </a>
          </li>
        </ul>
      </div>
    </section>

    <!-- Videos -->
    <section id="videos" class="py-20 px-4 band-parchment">
      <div class="container mx-auto">
        <div class="max-w-2xl">
          <h2 class="font-display text-3xl md:text-4xl text-ink">{{ p.videos.title }}</h2>
          <p class="mt-3 font-serif lead text-ink-soft">{{ p.videos.lead }}</p>
        </div>
        <div class="mt-8 grid gap-4 lg:grid-cols-[2fr_1fr]">
        <div class="aspect-video rounded-sm overflow-hidden bg-black border border-ink/25">
          <iframe :src="p.videos.main" title="First full playtest" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" loading="lazy" allowfullscreen class="w-full h-full" />
        </div>
        <div class="grid grid-cols-2 gap-4 content-start">
          <div v-for="src in p.videos.more" :key="src" class="aspect-video rounded-sm overflow-hidden bg-black border border-ink/25">
            <iframe :src="src" title="Playtest clip" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" loading="lazy" allowfullscreen class="w-full h-full" />
          </div>
        </div>
        </div>
      </div>
    </section>

    <!-- Files -->
    <SignupSection :data="p.signup" />

    <!-- About -->
    <section id="about" class="py-20 px-4">
      <div class="container mx-auto grid lg:grid-cols-2 gap-10 items-center">
        <div>
          <h2 class="font-display text-3xl md:text-4xl text-ink">{{ p.about.title }}</h2>
          <div class="mt-5 space-y-4 font-serif lead text-ink-soft">
            <RichText v-for="(para, i) in p.about.paragraphs" :key="i" tag="p" :text="para" />
          </div>
        </div>
        <div class="aspect-video rounded-sm overflow-hidden bg-black border border-ink/25">
          <iframe :src="p.about.video" title="About Cannons & Coastlines" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" loading="lazy" allowfullscreen class="w-full h-full" />
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.hero-copy { text-shadow: 0 2px 10px rgba(0, 0, 0, 0.45); }

/* Numbered rule steps: number, text, and an optional aside (table/photo). */
.step {
  display: grid;
  grid-template-columns: 3rem minmax(0, 1fr);
  gap: 0 1.25rem;
}
.step-aside { grid-column: 2; margin-top: 1.5rem; }
@media (min-width: 1024px) {
  .step { grid-template-columns: 4rem minmax(0, 1fr) 20rem; gap: 0 2.5rem; }
  .step-aside { grid-column: 3; margin-top: 0.4rem; }
}
.step-num {
  font-family: var(--font-display);
  font-size: 2.6rem;
  line-height: 1;
  color: var(--gold);
  border-right: 1px solid var(--rule);
  padding-right: 0.75rem;
  text-align: right;
  align-self: start;
}
@media (min-width: 1024px) { .step-num { font-size: 3.4rem; } }
</style>
