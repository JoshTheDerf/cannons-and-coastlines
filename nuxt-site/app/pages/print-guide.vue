<script setup lang="ts">
// /print-guide. The copy is content/pages/print-guide.yml, which
// scripts/lib/print_guide.py also renders into the PRINTING.md in every zip.
// Keep the fleet rows below in step with fleet_rows() there.

const { data: page } = await useAsyncData('print-guide', () =>
  queryCollection('pages').where('stem', '=', 'pages/print-guide').first()
)
// The hull renders already live on the parts page; reuse them by name.
const { data: parts } = await useAsyncData('parts', () =>
  queryCollection('pages').where('stem', '=', 'pages/parts').first()
)

if (!page.value) throw createError({ statusCode: 404, statusMessage: 'Print guide content missing' })

useSeoMeta({
  title: page.value.seo?.title,
  description: page.value.seo?.description
})

const p = computed(() => page.value!)

type Fleet = {
  id: string, name: string, set: string, hull?: string, matchRigging?: boolean
  supports?: boolean, petg?: boolean, parts?: [string, string][]
}

function rows(f: Fleet): [string, string][] {
  return [
    ...(f.hull ? [['Hull', f.hull] as [string, string]] : []),
    ['Masts and sails', f.matchRigging ? 'Same color as the hull' : 'Brown masts, white sails'],
    ...(f.parts ?? []),
    ['Supports', f.supports ? 'On' : 'Off'],
    ['Material', f.petg ? 'PLA. Translucent PETG works well for a ghostly look.' : 'PLA']
  ]
}

const renderFor = (name: string): string | undefined =>
  parts.value?.gallery?.hulls?.find((h: { name: string }) => h.name === name)?.render
</script>

<template>
  <div>
    <header class="band-sea py-24 px-4">
      <div class="band-watermark"><UIcon name="i-lucide-printer" /></div>
      <div class="container mx-auto max-w-3xl text-center">
        <h1 class="font-display text-4xl md:text-5xl text-ink">{{ p.hero.title }}</h1>
        <hr class="rule-gold my-5 mx-auto w-40">
        <p class="font-serif lead text-ink-soft">{{ p.hero.intro }}</p>
        <nav class="mt-6 flex flex-wrap justify-center gap-2 text-sm" aria-label="Fleets">
          <a
            v-for="f in (p.fleets.items as Fleet[])"
            :key="f.id"
            :href="`#${f.id}`"
            class="px-3 py-1 rounded-full border border-[color:var(--rule)] text-ink-soft hover:text-ink hover:border-ink/50"
          >{{ f.name }}</a>
        </nav>
      </div>
    </header>

    <!-- Settings and part colors -->
    <section class="py-16 px-4">
      <div class="container mx-auto grid lg:grid-cols-2 gap-10">
        <div>
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
        <div>
          <SectionHeader :title="p.colors.title" :description="p.colors.lead" align="left" size="sm" />
          <div class="card-parchment p-5">
            <dl class="rulebook-dl">
              <div v-for="r in (p.colors.rows as { id: string, part: string, color: string }[])" :key="r.id">
                <dt>{{ r.part }}</dt>
                <dd class="mt-0.5">{{ r.color }}</dd>
              </div>
            </dl>
          </div>
          <RichText tag="p" :text="p.colors.note" class="mt-4 font-serif text-sm muted" />
        </div>
      </div>
    </section>

    <!-- Per fleet -->
    <section class="py-16 px-4 band-parchment">
      <div class="container mx-auto">
        <SectionHeader :title="p.fleets.title" :description="p.fleets.lead" align="left" size="sm" />
        <div class="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          <div
            v-for="f in (p.fleets.items as Fleet[])"
            :id="f.id"
            :key="f.id"
            class="card-parchment p-5 scroll-mt-24"
          >
            <div v-if="renderFor(f.name)" class="aspect-video rounded-sm flex items-center justify-center mb-4 overflow-hidden border border-[#3a2f22]/25 bg-[#e3d4b6]">
              <img :src="renderFor(f.name)" :alt="`${f.name} hull`" loading="lazy" class="max-h-full max-w-full object-contain">
            </div>
            <h3 class="font-display text-lg">{{ f.name }}</h3>
            <hr class="rule-gold mt-3">
            <dl class="mt-3 text-sm grid gap-2">
              <div v-for="[label, value] in rows(f)" :key="label">
                <dt class="stamp text-[#7a5316]">{{ label }}</dt>
                <dd class="muted mt-0.5"><RichText :text="value" /></dd>
              </div>
            </dl>
            <FilesButtons v-if="findAddonFleet(f.id)" :fleet="f.id" class="mt-4" />
            <div class="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
              <NuxtLink :to="`/print-list/${f.set}`" class="text-[color:var(--gold)] hover:underline">Print list →</NuxtLink>
              <NuxtLink v-if="!findAddonFleet(f.id)" :to="`/shop/${f.id}`" class="text-[color:var(--gold)] hover:underline">Get the files →</NuxtLink>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="py-16 px-4">
      <div class="container mx-auto max-w-3xl text-center">
        <p class="font-serif lead text-ink-soft">
          How the pieces go together, and how many of each to print, is on the parts page.
        </p>
        <div class="mt-6 flex flex-wrap gap-3 justify-center">
          <UButton to="/parts" icon="i-lucide-puzzle" color="primary">The parts</UButton>
          <UButton to="/shop" icon="i-lucide-download" variant="ghost" color="neutral" class="btn-ink">The shop</UButton>
        </div>
      </div>
    </section>

    <BackHome />
  </div>
</template>
