<script setup lang="ts">
// /print-guide: settings, every piece and its color, each fleet, and how it
// all goes together (/parts redirects here). The copy is
// content/pages/print-guide.yml, which scripts/lib/print_guide.py also
// renders into the PRINTING.md in every zip; keep the fleet rows below in
// step with fleet_rows() there. The assembly steps are print-lists.yml
// `steps`, and hull pictures come from shared/data/fleets.json.
import { findFleet, fleetPage } from '#shared/utils/fleets'

const [{ data: page }, { data: lists }] = await Promise.all([
  useAsyncData('print-guide', () => queryCollection('pages').where('stem', '=', 'pages/print-guide').first()),
  useAsyncData('print-lists', () => queryCollection('pages').where('stem', '=', 'pages/print-lists').first())
])

if (!page.value) throw createError({ statusCode: 404, statusMessage: 'Print guide content missing' })

useSeoMeta({
  title: page.value.seo?.title,
  description: page.value.seo?.description
})

const p = computed(() => page.value!)

type GuideFleet = {
  id: string, name: string, set: string, hull?: string, matchRigging?: boolean
  supports?: boolean, petg?: boolean, parts?: [string, string][]
}
type Piece = { render: string, name: string, color: string, desc: string, tip?: string }

function rows(f: GuideFleet): [string, string][] {
  return [
    ...(f.hull ? [['Hull', f.hull] as [string, string]] : []),
    ['Masts and sails', f.matchRigging ? 'Same color as the hull' : 'Brown masts, white sails'],
    ...(f.parts ?? []),
    ['Supports', f.supports ? 'On' : 'Off'],
    ['Material', f.petg ? 'PLA. Translucent PETG works well for a ghostly look.' : 'PLA']
  ]
}

const hullFor = (id: string): string | undefined => findFleet(id)?.hull
const colorOf = (id: string): string =>
  (p.value.colors.rows as { id: string, color: string }[]).find(r => r.id === id)?.color ?? ''
const steps = computed(() => ((lists.value as any)?.steps?.items ?? []) as { text: string }[])

const sections = [
  { id: 'settings', label: 'Settings' },
  { id: 'pieces', label: 'Pieces and colors' },
  { id: 'fleets', label: 'Fleets' },
  { id: 'assembly', label: 'Putting it together' }
]
</script>

<template>
  <div>
    <header class="band-sea py-24 px-4">
      <div class="band-watermark"><UIcon name="i-lucide-printer" /></div>
      <div class="container mx-auto max-w-3xl text-center">
        <h1 class="font-display text-4xl md:text-5xl text-ink">{{ p.hero.title }}</h1>
        <hr class="rule-gold my-5 mx-auto w-40">
        <p class="font-serif lead text-ink-soft">{{ p.hero.intro }}</p>
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
    <section id="settings" class="py-16 px-4 scroll-mt-20">
      <div class="container mx-auto max-w-3xl">
        <SectionHeader :title="p.settings.title" :description="p.settings.lead" align="left" size="sm" />
        <div class="card-parchment p-5">
          <dl class="rulebook-dl">
            <div v-for="[label, value] in p.settings.rows" :key="label">
              <dt>{{ label }}</dt>
              <dd class="mt-0.5">{{ value }}</dd>
            </div>
          </dl>
        </div>
        <RichText tag="p" :text="p.settings.baseSet" class="mt-4 font-serif text-sm muted" />
      </div>
    </section>

    <!-- Pieces, with their colors -->
    <section id="pieces" class="py-16 px-4 band-parchment scroll-mt-20">
      <div class="container mx-auto">
        <SectionHeader :title="p.pieces.title" :description="p.pieces.lead" align="left" size="sm" />
        <div class="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          <div v-for="piece in (p.pieces.items as Piece[])" :key="piece.name" class="card-parchment p-5">
            <div class="aspect-[4/3] rounded-sm flex items-center justify-center mb-4 overflow-hidden border border-[#3a2f22]/25 bg-[#e3d4b6]">
              <img :src="piece.render" :alt="piece.name" loading="lazy" class="max-h-full max-w-full object-contain">
            </div>
            <h3 class="font-display text-lg">{{ piece.name }}</h3>
            <RichText tag="p" :text="piece.desc" class="mt-2 text-sm" />
            <hr class="rule-gold mt-3">
            <dl class="mt-3 text-sm grid gap-2">
              <div>
                <dt class="stamp text-[#7a5316]">Color</dt>
                <dd class="muted mt-0.5">{{ colorOf(piece.color) }}</dd>
              </div>
              <div v-if="piece.tip">
                <dt class="stamp text-[#7a5316]">Tip</dt>
                <dd class="muted mt-0.5"><RichText :text="piece.tip" /></dd>
              </div>
            </dl>
          </div>
        </div>
        <RichText tag="p" :text="p.colors.note" class="mt-5 font-serif text-sm muted" />
      </div>
    </section>

    <!-- Per fleet -->
    <section id="fleets" class="py-16 px-4 scroll-mt-20">
      <div class="container mx-auto">
        <SectionHeader :title="p.fleets.title" :description="p.fleets.lead" align="left" size="sm" />
        <div class="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          <div
            v-for="f in (p.fleets.items as GuideFleet[])"
            :id="f.id"
            :key="f.id"
            class="card-parchment p-5 scroll-mt-24"
          >
            <div v-if="hullFor(f.id)" class="aspect-video rounded-sm flex items-center justify-center mb-4 overflow-hidden border border-[#3a2f22]/25 bg-[#e3d4b6]">
              <img :src="hullFor(f.id)" :alt="`${f.name} hull`" loading="lazy" class="max-h-full max-w-full object-contain">
            </div>
            <h3 class="font-display text-lg"><NuxtLink :to="fleetPage(f)" class="hover:text-[color:var(--heading)]">{{ f.name }}</NuxtLink></h3>
            <hr class="rule-gold mt-3">
            <dl class="mt-3 text-sm grid gap-2">
              <div v-for="[label, value] in rows(f)" :key="label">
                <dt class="stamp text-[#7a5316]">{{ label }}</dt>
                <dd class="muted mt-0.5"><RichText :text="value" /></dd>
              </div>
            </dl>
            <div class="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
              <NuxtLink :to="`/print-list/${f.set}`" class="text-[color:var(--gold)] hover:underline">{{ findAddonFleet(f.id) ? 'Print list' : 'Print list and free download' }}</NuxtLink>
              <FilesButtons v-if="findAddonFleet(f.id)" :fleet="f.id" />
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Assembly -->
    <section id="assembly" class="py-16 px-4 band-parchment scroll-mt-20">
      <div class="container mx-auto max-w-3xl">
        <SectionHeader :title="p.assembly.title" :description="p.assembly.lead" align="left" size="sm" />
        <ol class="list-decimal pl-5 space-y-3 font-serif text-ink-soft">
          <li v-for="st in steps" :key="st.text"><RichText :text="st.text" /></li>
        </ol>
        <p class="mt-8 font-serif text-ink-soft">
          How many of each piece to print is on each fleet's print list.
          The <NuxtLink to="/print-list/base-set" class="underline text-[color:var(--gold)]">base set print list</NuxtLink>
          has the free download, and the add-on fleets are in the
          <NuxtLink to="/shop" class="underline text-[color:var(--gold)]">shop</NuxtLink>.
        </p>
      </div>
    </section>

    <BackHome />
  </div>
</template>
