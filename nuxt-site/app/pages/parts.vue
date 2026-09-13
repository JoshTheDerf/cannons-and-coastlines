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
    <header class="band-sea py-24 px-4">
      <div class="band-watermark"><UIcon name="i-lucide-compass" /></div>
      <div class="container mx-auto max-w-3xl text-center">
        <h1 class="font-display text-4xl md:text-5xl text-ink">{{ p.hero.title }}</h1>
        <hr class="rule-gold my-5 mx-auto w-40">
        <p class="font-serif lead text-ink-soft">{{ p.hero.intro }}</p>
      </div>
    </header>

    <!-- Gallery -->
    <section class="py-16 px-4">
      <div class="container mx-auto">
        <SectionHeader :title="p.gallery.title" :description="p.gallery.lead" align="left" size="sm" />
        <div class="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          <div v-for="hull in p.gallery.hulls" :key="hull.name" class="card-parchment p-5">
            <div class="aspect-video rounded-sm flex items-center justify-center mb-4 overflow-hidden border border-[#3a2f22]/25 bg-[#e3d4b6]">
              <img :src="hull.render" :alt="`${hull.name} hull`" loading="lazy" class="max-h-full max-w-full object-contain">
            </div>
            <div class="flex items-start justify-between gap-2">
              <h3 class="font-display text-lg">{{ hull.name }}</h3>
              <span class="stamp text-[#7a5316] shrink-0">{{ hull.badge }}</span>
            </div>
            <RichText tag="p" :text="hull.desc" class="mt-2 text-sm" />
            <hr class="rule-gold mt-3">
            <div class="mt-3 text-sm">
              <p class="stamp text-[#7a5316] mb-1">Color</p>
              <RichText tag="p" :text="hull.color" class="muted" />
            </div>
          </div>
        </div>

        <SectionHeader :title="p.gallery.partsTitle" :description="p.gallery.partsLead" align="left" size="sm" class="mt-16" />
        <div class="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-5">
          <div v-for="part in p.gallery.items" :key="part.name" class="card-parchment p-5">
            <div class="aspect-square rounded-sm flex items-center justify-center mb-4 overflow-hidden border border-[#3a2f22]/25 bg-[#e3d4b6]">
              <img :src="part.render" :alt="part.name" loading="lazy" class="max-h-full max-w-full object-contain">
            </div>
            <h3 class="font-display text-lg">{{ part.name }}</h3>
            <RichText tag="p" :text="part.desc" class="mt-2 text-sm" />
            <hr class="rule-gold mt-3">
            <div class="mt-3 text-sm">
              <p class="stamp text-[#7a5316] mb-1">Color</p>
              <RichText tag="p" :text="part.color" class="muted" />
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Assembly -->
    <section class="py-16 px-4 band-parchment">
      <div class="container mx-auto">
        <SectionHeader :title="p.assembly.title" :description="p.assembly.lead" align="left" size="sm" />
        <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          <div v-for="card in p.assembly.cards" :key="card.title" class="card-parchment p-6">
            <h3 class="font-display text-lg flex items-center gap-2">
              <UIcon :name="card.icon" class="size-5 text-[color:var(--gold)]" /> {{ card.title }}
            </h3>
            <hr class="rule-gold mt-3">
            <ol v-if="card.items && card.ordered" class="mt-3 space-y-2 font-serif text-sm muted list-decimal pl-5">
              <li v-for="(it, i) in card.items" :key="i"><RichText :text="it" /></li>
            </ol>
            <ul v-else-if="card.items" class="list-diamond mt-3 space-y-2 font-serif text-sm muted">
              <li v-for="(it, i) in card.items" :key="i"><RichText :text="it" /></li>
            </ul>
            <RichText v-if="card.body" tag="p" :text="card.body" class="mt-3 font-serif text-sm muted" />
          </div>
        </div>
      </div>
    </section>

    <!-- Printing -->
    <section class="py-16 px-4">
      <div class="container mx-auto">
        <SectionHeader :title="p.printing.title" :description="p.printing.lead" align="left" size="sm" />

        <div class="card-parchment p-5">
          <dl class="rulebook-dl">
            <div v-for="[label, value] in p.printing.defaults" :key="label">
              <dt>{{ label }}</dt>
              <dd class="mt-0.5">{{ value }}</dd>
            </div>
          </dl>
        </div>

        <div class="mt-6 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div v-for="n in p.printing.notes" :key="n.title" class="card-parchment flex gap-3 p-4">
            <UIcon :name="n.icon" class="size-5 text-[#9a7526] shrink-0 mt-0.5" />
            <div class="text-sm">
              <strong class="font-display">{{ n.title }}</strong>
              <RichText tag="p" :text="n.body" class="muted mt-1" />
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Print list -->
    <section class="py-16 px-4 band-parchment">
      <div class="container mx-auto">
        <SectionHeader :title="p.quantities.title" :description="p.quantities.lead" align="left" size="sm" tone="ink" />

        <div class="overflow-x-auto">
          <table class="rulebook font-serif text-sm">
            <thead>
              <tr>
                <th>Piece</th>
                <th>Qty</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="[piece, qty, note] in p.quantities.rows" :key="piece">
                <td class="font-semibold">{{ piece }}</td>
                <td class="whitespace-nowrap">{{ qty }}</td>
                <td class="muted"><RichText :text="note" /></td>
              </tr>
            </tbody>
          </table>
        </div>
        <RichText tag="p" :text="p.quantities.notPrinted" class="mt-4 font-serif text-sm muted" />
      </div>
    </section>

    <!-- CTA -->
    <section class="py-16 px-4">
      <div class="container mx-auto max-w-3xl text-center">
        <h2 class="font-display text-2xl text-ink">{{ p.cta.title }}</h2>
        <hr class="rule-gold my-4 mx-auto w-32">
        <p class="font-serif lead text-ink-soft">{{ p.cta.body }}</p>
        <div class="mt-6 flex flex-wrap gap-3 justify-center">
          <UButton
            v-for="b in p.cta.buttons"
            :key="b.label"
            :to="b.to"
            :icon="b.icon"
            :variant="b.variant === 'solid' ? 'solid' : 'ghost'"
            :color="b.variant === 'solid' ? 'primary' : 'neutral'"
            :class="b.variant === 'solid' ? '' : 'btn-ink'"
          >{{ b.label }}</UButton>
        </div>
      </div>
    </section>

    <BackHome />
  </div>
</template>
