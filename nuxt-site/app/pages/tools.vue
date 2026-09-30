<script setup lang="ts">
// /tools: CubbyCAD and Cubby Slicer. Copy is content/pages/tools.yml.

const { data: page } = await useAsyncData('tools', () =>
  queryCollection('pages').where('stem', '=', 'pages/tools').first()
)

if (!page.value) throw createError({ statusCode: 404, statusMessage: 'Tools content missing' })

useSeoMeta({
  title: page.value.meta?.title,
  description: page.value.meta?.description
})

const p = computed(() => page.value!)

type Shot = { src: string, alt: string, caption?: string }
type Tool = {
  id: string, name: string, url: string, lead: string, note?: string
  shots: Shot[]
  features: { title: string, body: string }[]
  links: { label: string, to: string, icon?: string }[]
}

const tools = computed(() => (p.value.tools?.items ?? []) as Tool[])
</script>

<template>
  <div>
    <header class="band-sea py-24 px-4">
      <div class="band-watermark"><UIcon name="i-lucide-drafting-compass" /></div>
      <div class="container mx-auto max-w-3xl text-center">
        <h1 class="font-display text-4xl md:text-5xl text-ink">{{ p.hero.title }}</h1>
        <hr class="rule-gold my-5 mx-auto w-40">
        <p class="font-serif lead text-ink-soft">{{ p.hero.intro }}</p>
        <nav class="mt-6 flex flex-wrap justify-center gap-2 text-sm" aria-label="Tools">
          <a
            v-for="t in tools"
            :key="t.id"
            :href="`#${t.id}`"
            class="px-3 py-1 rounded-full border border-[color:var(--rule)] text-ink-soft hover:text-ink hover:border-ink/50"
          >{{ t.name }}</a>
        </nav>
      </div>
    </header>

    <!-- Why -->
    <section class="py-16 px-4">
      <div class="container mx-auto max-w-3xl">
        <SectionHeader :title="p.intro.title" align="left" size="sm" />
        <div class="font-serif lead text-ink-soft space-y-4">
          <RichText v-for="(para, i) in p.intro.paragraphs" :key="i" tag="p" :text="para" />
        </div>
      </div>
    </section>

    <!-- One section per app -->
    <section
      v-for="(t, ti) in tools"
      :id="t.id"
      :key="t.id"
      :class="['py-16 px-4 scroll-mt-24', ti % 2 === 0 ? 'band-parchment' : '']"
    >
      <div class="container mx-auto">
        <SectionHeader :title="t.name" :description="t.lead" align="left" size="sm" />

        <div class="grid lg:grid-cols-5 gap-10 items-start">
          <div class="lg:col-span-3 grid grid-cols-2 gap-4">
            <figure
              v-for="(s, si) in t.shots"
              :key="s.src"
              :class="si === 0 || t.shots.length === 1 ? 'col-span-2' : 'col-span-2 sm:col-span-1'"
            >
              <a :href="s.src" target="_blank" rel="noopener" class="block rounded-sm overflow-hidden border border-[#3a2f22]/25 bg-[#e3d4b6]">
                <img :src="s.src" :alt="s.alt" loading="lazy" decoding="async" width="1200" height="750" class="w-full h-auto block">
              </a>
              <figcaption v-if="s.caption" class="mt-2 font-serif text-sm muted">{{ s.caption }}</figcaption>
            </figure>
          </div>

          <div class="lg:col-span-2">
            <dl class="grid gap-5">
              <div v-for="f in t.features" :key="f.title">
                <dt class="font-display text-lg">{{ f.title }}</dt>
                <dd class="mt-1 muted"><RichText :text="f.body" /></dd>
              </div>
            </dl>
            <RichText v-if="t.note" tag="p" :text="t.note" class="mt-6 font-serif text-sm muted" />
            <div class="mt-6 flex flex-wrap gap-3">
              <UButton
                v-for="(l, li) in t.links"
                :key="l.to"
                :to="l.to"
                target="_blank"
                :icon="l.icon"
                :color="li === 0 ? 'primary' : 'neutral'"
                :variant="li === 0 ? 'solid' : 'ghost'"
                :class="li === 0 ? '' : 'btn-ink'"
              >{{ l.label }}</UButton>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="py-16 px-4">
      <div class="container mx-auto max-w-3xl text-center">
        <p class="font-serif lead text-ink-soft">{{ p.cta.text }}</p>
        <div class="mt-6 flex flex-wrap gap-3 justify-center">
          <UButton to="/print-guide" icon="i-lucide-printer" color="primary">Print guide</UButton>
          <UButton to="/parts" icon="i-lucide-puzzle" variant="ghost" color="neutral" class="btn-ink">The parts</UButton>
        </div>
      </div>
    </section>

    <BackHome />
  </div>
</template>
