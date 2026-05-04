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
        <h2 class="font-display text-2xl text-white">{{ p.gallery.title }}</h2>
        <p class="mt-2 text-white/70 max-w-3xl">{{ p.gallery.lead }}</p>
        <div class="mt-8 grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          <div v-for="part in p.gallery.items" :key="part.name" class="rounded-2xl border border-white/10 bg-secondary-900/60 p-5">
            <div class="aspect-square bg-secondary-950/40 rounded-lg flex items-center justify-center mb-4">
              <img :src="part.render" :alt="part.name" loading="lazy" class="max-h-full max-w-full object-contain">
            </div>
            <h3 class="font-display text-lg text-white">{{ part.name }}</h3>
            <RichText tag="p" :text="part.desc" class="mt-2 text-sm text-white/80" />
            <div class="mt-3 pt-3 border-t border-white/10 text-xs">
              <p class="uppercase tracking-widest font-semibold text-primary-300 mb-1">Recommended Color</p>
              <RichText tag="p" :text="part.color" class="text-white/70" />
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Assembly -->
    <section class="py-16 px-4 bg-secondary-900/50">
      <div class="container mx-auto">
        <h2 class="font-display text-2xl text-white">{{ p.assembly.title }}</h2>
        <p class="mt-2 text-white/70 max-w-3xl">{{ p.assembly.lead }}</p>
        <div class="mt-8 grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          <div v-for="card in p.assembly.cards" :key="card.title" class="rounded-2xl border border-white/10 bg-secondary-900/60 p-6">
            <h3 class="font-display text-lg text-white flex items-center gap-2">
              <UIcon :name="card.icon" class="size-5 text-primary-300" /> {{ card.title }}
            </h3>
            <component :is="card.ordered ? 'ol' : 'ul'" v-if="card.items" class="mt-3 space-y-2 text-sm text-white/80" :class="card.ordered ? 'list-decimal pl-5' : ''">
              <li v-for="(it, i) in card.items" :key="i" class="flex gap-2" :class="card.ordered ? '' : ''">
                <span v-if="!card.ordered" class="text-primary-300">•</span>
                <RichText :text="it" />
              </li>
            </component>
            <RichText v-if="card.body" tag="p" :text="card.body" class="mt-3 text-sm text-white/80" />
          </div>
        </div>
      </div>
    </section>

    <!-- Settings -->
    <section class="py-16 px-4">
      <div class="container mx-auto">
        <h2 class="font-display text-2xl text-white">{{ p.settings.title }}</h2>
        <p class="mt-2 text-white/70 max-w-3xl">{{ p.settings.lead }}</p>

        <div class="mt-8 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div v-for="card in p.settings.cards" :key="card.title" class="rounded-xl bg-secondary-900/60 border border-white/10 p-5">
            <h4 class="font-display text-base text-white mb-3">{{ card.title }}</h4>
            <dl class="text-sm grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
              <template v-for="row in card.rows" :key="row[0]">
                <dt class="text-white/50 uppercase text-[11px] tracking-wider self-center">{{ row[0] }}</dt>
                <dd class="text-white/90">
                  <RichText :text="row[1]" />
                </dd>
              </template>
            </dl>
          </div>
        </div>

        <div class="mt-10 grid sm:grid-cols-2 gap-4">
          <div v-for="c in p.settings.callouts" :key="c.title" class="flex gap-3 rounded-xl bg-primary-500/10 border border-primary-500/20 p-4">
            <UIcon :name="c.icon" class="size-5 text-primary-300 shrink-0 mt-0.5" />
            <div class="text-sm">
              <strong class="text-white">{{ c.title }}.</strong>
              <p class="text-white/80 mt-1">{{ c.body }}</p>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Quantities -->
    <section class="py-16 px-4 bg-secondary-900/50">
      <div class="container mx-auto">
        <h2 class="font-display text-2xl text-white">{{ p.quantities.title }}</h2>
        <p class="mt-2 text-white/70 max-w-3xl">{{ p.quantities.lead }}</p>

        <div class="mt-8 rounded-2xl border border-white/10 bg-secondary-900/60 p-6">
          <h3 class="font-display text-lg text-white">{{ p.quantities.subtitle }}</h3>
          <p class="text-white/70 text-sm mt-1">{{ p.quantities.subLead }}</p>
          <div class="mt-5 overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="text-left text-xs uppercase tracking-widest text-primary-300 border-b border-white/10">
                  <th class="py-2 pr-4 font-semibold">Piece</th>
                  <th class="py-2 pr-4 font-semibold">Qty</th>
                  <th class="py-2 font-semibold">Notes</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in p.quantities.rows" :key="row[0]" class="border-b border-white/5 align-top">
                  <td class="py-2 pr-4 text-white">{{ row[0] }}</td>
                  <td class="py-2 pr-4 text-white/90 whitespace-nowrap">{{ row[1] }}</td>
                  <td class="py-2 text-white/70"><RichText :text="row[2]" /></td>
                </tr>
              </tbody>
            </table>
          </div>
          <RichText tag="p" :text="p.quantities.drawBag" class="mt-4 text-sm text-white/80" />
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

    <div class="text-center pb-12 text-sm text-white/60">
      <NuxtLink to="/" class="underline hover:text-white">← Back to home page</NuxtLink>
    </div>
  </div>
</template>
