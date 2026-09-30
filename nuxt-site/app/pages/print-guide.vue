<script setup lang="ts">
// /print-guide: the print guide and the free base set's print list in one.
// How to do it, the settings, the base set's tables and CubbySlicer plates,
// the assembly steps and a card for each add-on fleet (whose own lists are
// /print-list/<set>). /print-list/base-set and /parts redirect here.
//
// The copy is content/pages/print-guide.yml (settings, fleets, assembly
// lead) and print-lists.yml (the tables, howTo, steps, kit), the same files
// PRINTING.pdf and PRINTING.md are built from. Hull pictures come from
// shared/data/fleets.json.
import { findFleet, fleetPage } from '#shared/utils/fleets'
import { BASE_SET_ID, printListPath, usePrintList, type GuideFleet } from '~/composables/usePrintList'

const pl = await usePrintList(BASE_SET_ID)
const { L, G, orderKey, share, downloadUrl, pdfUrl, versions } = pl

useSeoMeta({
  title: G.seo?.title,
  description: G.seo?.description,
  // Order page links carry the order key (a credential) in the URL.
  ...(orderKey || share ? { robots: 'noindex, nofollow' } : {}),
  referrer: 'no-referrer'
})

const addonFleets = (G.fleets.items as GuideFleet[]).filter(f => f.set !== BASE_SET_ID)

function rows(f: GuideFleet): [string, string][] {
  return [
    ...(f.hull ? [['Hull', f.hull] as [string, string]] : []),
    ['Masts and sails', f.matchRigging ? 'Same color as the hull' : 'Brown masts, white sails'],
    ...(f.parts ?? []),
    ['Supports', f.supports ? 'Yes' : 'No']
  ]
}
const hullFor = (id: string): string | undefined => findFleet(id)?.hull
const steps = (L.steps.items as { text: string }[])

const sections = [
  { id: 'settings', label: 'Settings' },
  { id: 'queens-fleet', label: 'Parts list' },
  { id: 'slicer', label: 'CubbySlicer' },
  { id: 'assembly', label: 'Putting it together' },
  { id: 'fleets', label: 'Add-on fleets' }
]
</script>

<template>
  <div>
    <header class="band-sea py-16 md:py-20 px-4">
      <div class="band-watermark"><UIcon name="i-lucide-printer" /></div>
      <div class="container mx-auto max-w-3xl text-center">
        <h1 class="font-display text-4xl md:text-5xl text-ink">{{ G.hero.title }}</h1>
        <hr class="rule-gold my-5 mx-auto w-40">
        <p class="font-serif lead text-ink-soft">{{ G.hero.intro }}</p>
        <p class="mt-2 text-sm text-ink-faint">{{ versions }}</p>

        <div class="mt-7 flex flex-wrap justify-center gap-3">
          <UButton v-if="downloadUrl" :to="downloadUrl" external color="primary" size="xl" icon="i-lucide-download">
            Download the base set (zip)
          </UButton>
        </div>
        <p class="mt-4 flex flex-wrap justify-center gap-x-5 gap-y-1 text-sm">
          <a :href="pdfUrl" target="_blank" class="underline text-[color:var(--gold)]">This list as a PDF</a>
          <NuxtLink v-if="orderKey" :to="`/shop/order/${orderKey}`" class="underline text-[color:var(--gold)]">Back to your order</NuxtLink>
        </p>

        <HowToSteps :title="L.howTo.title" :steps="pl.howTo" class="mt-8" />

        <nav class="mt-6 flex flex-wrap justify-center gap-2 text-sm" aria-label="On this page">
          <a
            v-for="s in sections"
            :key="s.id"
            :href="`#${s.id}`"
            class="px-3 py-1 rounded-full border border-[color:var(--rule)] text-ink-soft hover:text-ink hover:border-ink/50"
          >{{ s.label }}</a>
        </nav>
      </div>
    </header>

    <!-- Settings -->
    <section id="settings" class="pt-12 px-4 scroll-mt-20">
      <div class="container mx-auto max-w-4xl">
        <h2 class="font-display text-2xl text-ink">{{ G.settings.title }}</h2>
        <p class="mt-1 mb-4 font-serif text-sm muted">{{ G.settings.lead }}</p>
        <dl class="grid grid-cols-2 sm:grid-cols-3 gap-4 card-parchment p-4">
          <div v-for="[label, value] in (G.settings.rows as [string, string][])" :key="label">
            <dt class="stamp text-[#7a5316]">{{ label }}</dt>
            <dd class="mt-1 font-serif text-ink">{{ value }}</dd>
          </div>
        </dl>
      </div>
    </section>

    <!-- The base set's print list and plates. #pieces is for old /parts#pieces links. -->
    <div id="pieces" class="scroll-mt-20">
      <PrintListBody :pl="pl" />
    </div>

    <!-- Assembly -->
    <section id="assembly" class="py-14 px-4 band-parchment scroll-mt-20">
      <div class="container mx-auto max-w-4xl">
        <h2 class="font-display text-2xl text-ink">{{ G.assembly.title }}</h2>
        <p class="mt-2 max-w-3xl font-serif text-ink-soft">{{ G.assembly.lead }}</p>
        <ol class="mt-4 max-w-3xl list-decimal pl-5 space-y-3 font-serif text-ink-soft">
          <li v-for="st in steps" :key="st.text"><RichText :text="st.text" /></li>
        </ol>
        <h3 class="mt-8 font-display text-lg text-ink">{{ L.kit.title }}</h3>
        <RichText tag="p" :text="L.kit.body" class="mt-1 max-w-3xl font-serif text-ink-soft" />
      </div>
    </section>

    <!-- Add-on fleets -->
    <section id="fleets" class="py-16 px-4 scroll-mt-20">
      <div class="container mx-auto max-w-4xl">
        <SectionHeader :title="G.fleets.title" :description="G.fleets.lead" align="left" size="sm" />
        <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          <div
            v-for="f in addonFleets"
            :id="f.id"
            :key="f.id"
            class="card-parchment p-5 scroll-mt-24 flex flex-col"
          >
            <div v-if="hullFor(f.id)" class="aspect-video rounded-sm flex items-center justify-center mb-4 overflow-hidden border border-[#3a2f22]/25 bg-[#e3d4b6]">
              <img :src="hullFor(f.id)" :alt="`${f.name} hull`" loading="lazy" class="max-h-full max-w-full object-contain">
            </div>
            <h3 class="font-display text-lg"><NuxtLink :to="fleetPage(f)" class="hover:text-[color:var(--heading)]">{{ f.name }}</NuxtLink></h3>
            <hr class="rule-gold mt-3">
            <!-- Label left, value right. A long label (Turrets and smokestacks) wraps in its column. -->
            <dl class="mt-3 grid grid-cols-[5.5rem_1fr] gap-x-3 gap-y-1.5 text-sm font-serif">
              <template v-for="[label, value] in rows(f)" :key="label">
                <dt class="text-ink-faint leading-snug">{{ label }}</dt>
                <dd class="text-ink leading-snug"><RichText :text="value" /></dd>
              </template>
            </dl>
            <div class="mt-auto pt-4 flex items-center justify-between gap-3 text-sm">
              <NuxtLink :to="printListPath(f.set)" class="font-semibold whitespace-nowrap hover:underline">Print list</NuxtLink>
              <FilesButtons :fleet="f.id" size="sm" />
            </div>
          </div>
        </div>
      </div>
    </section>

    <BackHome />
  </div>
</template>
