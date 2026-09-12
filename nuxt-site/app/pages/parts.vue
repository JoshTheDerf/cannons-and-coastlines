<script setup lang="ts">
const { data: page } = await useAsyncData('parts', () =>
  queryCollection('pages').where('stem', '=', 'pages/parts').first()
)

if (!page.value) throw createError({ statusCode: 404, statusMessage: 'Parts content missing' })

useSeoMeta({
  title: page.value.meta?.title,
  description: page.value.meta?.description
})

const p = computed(() => page.value!)
</script>

<template>
  <div>
    <header class="relative py-24 px-4 overflow-hidden" style="background: linear-gradient(180deg, #2c4a52 0%, #3d5f6a 100%);">
      <div class="container mx-auto max-w-3xl text-center">
        <h1 class="font-display text-4xl md:text-5xl text-white">{{ p.hero.title }}</h1>
        <p class="mt-4 text-white/80">{{ p.hero.intro }}</p>
      </div>
    </header>

    <!-- Gallery -->
    <section class="py-16 px-4">
      <div class="container mx-auto">
        <SectionHeader :title="p.gallery.title" :description="p.gallery.lead" align="left" size="sm" />
        <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          <div v-for="hull in p.gallery.hulls" :key="hull.name" class="rounded-2xl border border-white/10 bg-secondary-900/60 p-5">
            <div class="aspect-video bg-secondary-950/40 rounded-lg flex items-center justify-center mb-4 overflow-hidden">
              <img :src="hull.render" :alt="`${hull.name} hull`" loading="lazy" class="max-h-full max-w-full object-contain">
            </div>
            <div class="flex items-center justify-between gap-2">
              <h3 class="font-display text-lg text-white">{{ hull.name }}</h3>
              <span class="text-[10px] uppercase tracking-widest font-semibold text-primary-300 bg-primary-500/15 px-2 py-1 rounded shrink-0">{{ hull.badge }}</span>
            </div>
            <RichText tag="p" :text="hull.desc" class="mt-2 text-sm text-white/80" />
            <div class="mt-3 pt-3 border-t border-white/10 text-xs">
              <p class="uppercase tracking-widest font-semibold text-primary-300 mb-1">Color</p>
              <RichText tag="p" :text="hull.color" class="text-white/70" />
            </div>
          </div>
        </div>

        <SectionHeader :title="p.gallery.partsTitle" :description="p.gallery.partsLead" align="left" size="sm" class="mt-16" />
        <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          <div v-for="part in p.gallery.items" :key="part.name" class="rounded-2xl border border-white/10 bg-secondary-900/60 p-5">
            <div class="aspect-square bg-secondary-950/40 rounded-lg flex items-center justify-center mb-4">
              <img :src="part.render" :alt="part.name" loading="lazy" class="max-h-full max-w-full object-contain">
            </div>
            <h3 class="font-display text-lg text-white">{{ part.name }}</h3>
            <RichText tag="p" :text="part.desc" class="mt-2 text-sm text-white/80" />
            <div class="mt-3 pt-3 border-t border-white/10 text-xs">
              <p class="uppercase tracking-widest font-semibold text-primary-300 mb-1">Color</p>
              <RichText tag="p" :text="part.color" class="text-white/70" />
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Assembly -->
    <section class="py-16 px-4 bg-secondary-900/50">
      <div class="container mx-auto">
        <SectionHeader :title="p.assembly.title" :description="p.assembly.lead" align="left" size="sm" />
        <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          <div v-for="card in p.assembly.cards" :key="card.title" class="rounded-2xl border border-white/10 bg-secondary-900/60 p-6">
            <h3 class="font-display text-lg text-white flex items-center gap-2">
              <UIcon :name="card.icon" class="size-5 text-primary-300" /> {{ card.title }}
            </h3>
            <ol v-if="card.items && card.ordered" class="mt-3 space-y-2 text-sm text-white/80 list-decimal pl-5">
              <li v-for="(it, i) in card.items" :key="i"><RichText :text="it" /></li>
            </ol>
            <ul v-else-if="card.items" class="mt-3 space-y-2 text-sm text-white/80">
              <li v-for="(it, i) in card.items" :key="i" class="flex gap-2">
                <span class="text-primary-300">•</span>
                <RichText :text="it" />
              </li>
            </ul>
            <RichText v-if="card.body" tag="p" :text="card.body" class="mt-3 text-sm text-white/80" />
          </div>
        </div>
      </div>
    </section>

    <!-- Printing -->
    <section class="py-16 px-4">
      <div class="container mx-auto">
        <SectionHeader :title="p.printing.title" :description="p.printing.lead" align="left" size="sm" />

        <dl class="rounded-xl bg-secondary-900/60 border border-white/10 p-5 grid sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-3 text-sm">
          <div v-for="[label, value] in p.printing.defaults" :key="label">
            <dt class="text-white/50 uppercase text-[11px] tracking-wider">{{ label }}</dt>
            <dd class="text-white/90 mt-0.5">{{ value }}</dd>
          </div>
        </dl>

        <div class="mt-6 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div v-for="n in p.printing.notes" :key="n.title" class="flex gap-3 rounded-xl bg-primary-500/10 border border-primary-500/20 p-4">
            <UIcon :name="n.icon" class="size-5 text-primary-300 shrink-0 mt-0.5" />
            <div class="text-sm">
              <strong class="text-white">{{ n.title }}</strong>
              <RichText tag="p" :text="n.body" class="text-white/80 mt-1" />
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Print list -->
    <section class="py-16 px-4 bg-secondary-900/50">
      <div class="container mx-auto">
        <SectionHeader :title="p.quantities.title" :description="p.quantities.lead" align="left" size="sm" />

        <div class="rounded-2xl border border-white/10 bg-secondary-900/60 p-6">
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="text-left text-xs uppercase tracking-widest text-primary-300 border-b border-white/10">
                  <th class="py-2 pr-4 font-semibold">Piece</th>
                  <th class="py-2 pr-4 font-semibold">Qty</th>
                  <th class="py-2 font-semibold">Notes</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="[piece, qty, note] in p.quantities.rows" :key="piece" class="border-b border-white/5 align-top">
                  <td class="py-2 pr-4 text-white">{{ piece }}</td>
                  <td class="py-2 pr-4 text-white/90 whitespace-nowrap">{{ qty }}</td>
                  <td class="py-2 text-white/70"><RichText :text="note" /></td>
                </tr>
              </tbody>
            </table>
          </div>
          <RichText tag="p" :text="p.quantities.notPrinted" class="mt-4 text-sm text-white/80" />
        </div>
      </div>
    </section>

    <!-- CTA -->
    <section class="py-16 px-4">
      <div class="container mx-auto max-w-3xl text-center">
        <h2 class="font-display text-2xl text-white">{{ p.cta.title }}</h2>
        <p class="mt-3 text-white/80">{{ p.cta.body }}</p>
        <div class="mt-6 flex flex-wrap gap-3 justify-center">
          <UButton v-for="b in p.cta.buttons" :key="b.label" :to="b.to" :icon="b.icon" :variant="b.variant" :color="b.variant === 'solid' ? 'primary' : 'neutral'">{{ b.label }}</UButton>
        </div>
      </div>
    </section>

    <BackHome />
  </div>
</template>
