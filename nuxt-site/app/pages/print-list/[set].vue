<script setup lang="ts">
// /print-list/<set-id or bundle-id>. What to print from one download, and
// the button that downloads it. Every download link on the site lands here
// first: the free base set, and the paid sets and bundle from the order page.
//
// The list is public (it only names parts). The zip is not: a paid set's
// button goes to /api/download/<id> with the ?order= key or ?share= token
// this page was opened with, and that route does the entitlement check.
//
// Words: content/pages/print-lists.yml and print-guide.yml, the same files
// rulebook/typst/print-list.typ renders into PRINTING.pdf (which also has
// the assembly steps; here they're a link to /parts). Keep
// colorOf() and qtyOf() in step with color-of() and qty-of() there.

import manifest from '~~/server/data/sets.json'

type Part = {
  part: string, file: string, each?: number, qty?: number | string, color: string
  base?: boolean, supports?: boolean, note?: string, render?: string
}
type ListFleet = { id: string, set: string, ships: number, shipType: string, fittings: string, parts: Part[] }
type GuideFleet = { id: string, name: string, set: string, hull: string, matchRigging?: boolean, supports?: boolean, petg?: boolean }
type ColorRow = { id: string, part: string, color: string }
type SetEntry = { id: string, title: string, paid: boolean, version: string, freeDownloadUrl: string | null }
type BundleEntry = { id: string, title: string, zipBaseName: string, includes: { set: string, folder: string }[] }

const route = useRoute()
const id = String(route.params.set)

const sets = manifest.sets as SetEntry[]
const bundles = (manifest as { bundles?: BundleEntry[] }).bundles ?? []
const set = sets.find(s => s.id === id) ?? null
const bundle = set ? null : bundles.find(b => b.id === id) ?? null
if (!set && !bundle) throw createError({ statusCode: 404, statusMessage: 'No print list for that set' })

const [{ data: lists }, { data: guide }] = await Promise.all([
  useAsyncData('print-lists', () => queryCollection('pages').where('stem', '=', 'pages/print-lists').first()),
  useAsyncData('print-guide', () => queryCollection('pages').where('stem', '=', 'pages/print-guide').first())
])
if (!lists.value || !guide.value) throw createError({ statusCode: 500, statusMessage: 'Print list content missing' })

const L = computed(() => lists.value as any)
const G = computed(() => guide.value as any)

const setIds = bundle ? bundle.includes.map(i => i.set) : [id]
const baseSetId: string = (lists.value as any).base.set
const hasBase = setIds.includes(baseSetId)
const guideFleets = computed(() => G.value.fleets.items as GuideFleet[])
const guideFleet = (fid: string) => guideFleets.value.find(f => f.id === fid)!
const fleets = computed(() => (L.value.fleets.items as ListFleet[]).filter(f => setIds.includes(f.set)))
const isPaid = (setId: string) => sets.find(s => s.id === setId)?.paid ?? false

const title = bundle
  ? bundle.title
  : guideFleets.value.filter(f => f.set === id).map(f => f.name).join(' and ')

// ── Lookups (mirrors print-list.typ) ────────────────────────────────────
function colorOf(key: string, fleet?: ListFleet): string {
  const gf = fleet ? guideFleet(fleet.id) : undefined
  if (gf && (key === 'hull' || (gf.matchRigging && (key === 'masts' || key === 'sails')))) return gf.hull
  return (G.value.colors.rows as ColorRow[]).find(r => r.id === key)?.color ?? key
}
const qtyOf = (p: Part, fleet?: ListFleet) => p.each && fleet ? p.each * fleet.ships : p.qty
const RENDER_VERSION: Record<string, string> = {
  'mast': '?v=0.5', 'cannon': '?v=0.5', 'cargo': '?v=0.5', 'movement-wheel': '?v=0.5',
  'ship-queens-fleet': '?v=0.5', 'ship-corsair': '?v=0.5', 'ship-shadow-fleet': '?v=2',
  'cannonball': '?v=3', 'rock1': '?v=2', 'reef': '?v=2', 'sail-damaged': '?v=2',
  'sail-stone-fleet': '?v=2', 'sail-islanders': '?v=2'
}
const renderOf = (p: Part) => {
  const stem = p.render ?? p.file.replace(/\.stl$/, '')
  return `/assets/images/renders/${stem}.png${RENDER_VERSION[stem] ?? ''}`
}

// ── The download ────────────────────────────────────────────────────────
// Only the forms the download route accepts are passed on; anything else is
// dropped rather than echoed into a link.
const orderKey = typeof route.query.order === 'string' && /^[0-9a-f]{32}$/.test(route.query.order) ? route.query.order : null
const share = typeof route.query.share === 'string' && /^[\w-]{8,128}$/.test(route.query.share) ? route.query.share : null
const free = !!set && !set.paid
const downloadUrl = free
  ? set!.freeDownloadUrl
  : orderKey ? `/api/download/${id}?order=${orderKey}`
    : share ? `/api/download/${id}?share=${encodeURIComponent(share)}`
      : null
const shopHandle = set ? (free ? 'base-set-files' : guideFleets.value.find(f => f.set === id)?.id ?? null) : null
const pdfUrl = `/rulebook/pdf/print-list-${id}.pdf`
// The part tables already say which parts need supports.
const settingsRows = computed(() => (G.value.settings.rows as [string, string][]).filter(([k]) => k !== 'Supports'))
const versions = setIds.map((s) => {
  const e = sets.find(x => x.id === s)!
  return `${e.title} v${e.version}`
}).join(' · ')

useSeoMeta({
  title: `${title} print list`,
  description: `What to print for ${title}: every STL, how many copies, what color and whether it needs supports.`,
  // The order key and share token are credentials in the URL.
  ...(orderKey || share ? { robots: 'noindex, nofollow' } : {}),
  referrer: 'no-referrer'
})
</script>

<template>
  <div>
    <header class="band-sea py-16 md:py-20 px-4">
      <div class="band-watermark"><UIcon name="i-lucide-printer" /></div>
      <div class="container mx-auto max-w-3xl text-center">
        <h1 class="font-display text-4xl md:text-5xl text-ink">{{ title }} print list</h1>
        <hr class="rule-gold my-5 mx-auto w-40">
        <p class="font-serif lead text-ink-soft">{{ L.hero.intro }}</p>
        <p v-if="bundle" class="mt-2 font-serif text-ink-soft">{{ L.bundle.intro }}</p>
        <p class="mt-2 text-sm text-ink-faint">{{ versions }}</p>

        <div class="mt-7 flex flex-wrap justify-center gap-3">
          <UButton v-if="downloadUrl" :to="downloadUrl" external color="primary" size="xl" icon="i-lucide-download">
            {{ bundle ? 'Download every fleet (zip)' : 'Download the STLs (zip)' }}
          </UButton>
          <template v-else>
            <UButton v-if="shopHandle" :to="`/shop/${shopHandle}`" color="primary" size="xl" icon="i-lucide-shopping-cart">
              Get the files
            </UButton>
            <UButton v-else to="/shop" color="primary" size="xl" icon="i-lucide-shopping-cart">
              The shop
            </UButton>
          </template>
          <UButton :to="pdfUrl" external target="_blank" variant="ghost" color="neutral" size="xl" icon="i-lucide-file-text" class="btn-ink">
            Print list (PDF)
          </UButton>
        </div>
        <p v-if="!downloadUrl" class="mt-4 text-sm text-ink-soft">
          Already bought {{ bundle ? 'them' : 'it' }}? The download is on your order page, linked in your Stripe receipt email.
        </p>
        <p v-else-if="orderKey" class="mt-4 text-sm text-ink-soft">
          <NuxtLink :to="`/shop/order/${orderKey}`" class="underline">Back to your order</NuxtLink>
        </p>
      </div>
    </header>

    <!-- One list per fleet -->
    <section v-for="f in fleets" :id="f.id" :key="f.id" class="pt-10 pb-2 px-4 scroll-mt-20">
      <div class="container mx-auto max-w-4xl">
        <h2 v-if="fleets.length > 1" class="font-display text-2xl text-ink">{{ guideFleet(f.id).name }}</h2>
        <p class="mt-1 mb-4 font-serif text-sm muted">{{ f.ships }} {{ f.shipType }} with {{ f.fittings }}</p>
        <div class="overflow-x-auto">
          <table class="rulebook print-list table-fixed w-full min-w-[36rem] font-serif text-sm">
            <thead>
              <tr><th class="w-16"><span class="sr-only">Picture</span></th><th>Part</th><th class="w-20">Qty</th><th class="w-44">Color</th><th class="w-24">Supports</th></tr>
            </thead>
            <tbody>
              <tr v-for="p in f.parts" :key="p.file + p.part">
                <td><img :src="renderOf(p)" alt="" loading="lazy" class="size-12 object-contain"></td>
                <td>
                  <span class="font-semibold">{{ p.part }}</span>
                  <br><span class="text-xs italic text-ink-faint">{{ p.file }}<template v-if="p.base && isPaid(f.set)"> from the base set</template></span>
                  <RichText v-if="p.note" tag="div" :text="p.note" class="text-xs muted" />
                </td>
                <td class="font-semibold text-base whitespace-nowrap">{{ qtyOf(p, f) }}</td>
                <td><RichText :text="colorOf(p.color, f)" /></td>
                <td>{{ p.supports ? 'Yes' : 'No' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-if="isPaid(f.set) && !hasBase" class="mt-3 font-serif text-sm">
          {{ L.base.body }}
          <NuxtLink :to="`/print-list/${baseSetId}`" class="underline text-[color:var(--gold)]">Base set print list and free download →</NuxtLink>
        </p>
      </div>
    </section>

    <!-- Shared pieces -->
    <section v-if="hasBase" class="pt-10 pb-14 px-4">
      <div class="container mx-auto max-w-4xl">
        <h2 class="font-display text-2xl text-ink">{{ L.general.title }}</h2>
        <div v-for="sec in ['perPlayer', 'perTable']" :key="sec" class="mt-6">
          <h3 class="font-display text-lg text-ink">{{ L.general[sec].title }}</h3>
          <div class="overflow-x-auto">
            <table class="rulebook print-list table-fixed w-full min-w-[36rem] font-serif text-sm">
              <thead>
                <tr><th class="w-16"><span class="sr-only">Picture</span></th><th>Part</th><th class="w-20">Qty</th><th class="w-44">Color</th><th class="w-24">Supports</th></tr>
              </thead>
              <tbody>
                <tr v-for="p in (L.general[sec].parts as Part[])" :key="p.file">
                  <td><img :src="renderOf(p)" alt="" loading="lazy" class="size-12 object-contain"></td>
                  <td>
                    <span class="font-semibold">{{ p.part }}</span>
                    <br><span class="text-xs italic text-ink-faint">{{ p.file }}</span>
                    <RichText v-if="p.note" tag="div" :text="p.note" class="text-xs muted" />
                  </td>
                  <td class="font-semibold text-base whitespace-nowrap">{{ qtyOf(p) }}</td>
                  <td><RichText :text="colorOf(p.color)" /></td>
                  <td>{{ p.supports ? 'Yes' : 'No' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>

    <!-- Printing, and what a game needs -->
    <section class="mt-10 py-14 px-4 band-parchment">
      <div class="container mx-auto max-w-4xl grid md:grid-cols-2 gap-10">
        <div>
          <h2 class="font-display text-2xl text-ink">Printing</h2>
          <dl class="mt-4 rulebook-dl">
            <div v-for="[label, value] in settingsRows" :key="label">
              <dt>{{ label }}</dt>
              <dd class="mt-0.5">{{ value }}</dd>
            </div>
          </dl>
          <RichText v-for="t in L.tips" :key="t" tag="p" :text="t" class="mt-3 font-serif text-sm text-ink-soft" />
          <p class="mt-4 text-sm">
            <NuxtLink to="/parts#assembly" class="underline text-[color:var(--gold)]">How it goes together →</NuxtLink>
          </p>
        </div>
        <div>
          <h2 class="font-display text-2xl text-ink">{{ L.kit.title }}</h2>
          <RichText v-for="(para, i) in L.kit.body" :key="i" tag="p" :text="para" class="mt-3 font-serif text-sm text-ink-soft" />
          <p v-if="!hasBase" class="mt-2 font-serif text-sm">
            The islands, coins and terrain come with the
            <NuxtLink :to="`/print-list/${baseSetId}`" class="underline text-[color:var(--gold)]">free base set</NuxtLink>.
          </p>
        </div>
      </div>
    </section>

    <BackHome />
  </div>
</template>

<style scoped>
.print-list td { vertical-align: middle; }
</style>
