<script setup lang="ts">
import type { ShopProductCard } from '~/composables/useShop'

const { listProducts, cart, loadCart } = useShop()
const { data: products } = await useAsyncData('shop-products', () => listProducts())
const { data: setsData } = await useFleetSets()
const { data: fleetCopy } = await useFleetCopy()

onMounted(() => { if (!cart.value) loadCart() })

useSeoMeta({
  title: 'Shop',
  description: 'Printed Cannons & Coastlines fleet kits, made to order in Georgia, and STL files for every fleet.'
})

// One filter row instead of separate pages: most people arrive wanting one
// format, and the same faction appears under both.
type Filter = 'all' | 'kits' | 'files'
const route = useRoute()
const filter = ref<Filter>(['kits', 'files'].includes(String(route.query.show)) ? route.query.show as Filter : 'all')
watch(filter, f => navigateTo({ query: f === 'all' ? {} : { show: f } }, { replace: true }))

const setFor = (p: ShopProductCard) => setsData.value?.all.find(s => s.id === p.setId) ?? null

function kitLabel(p: ShopProductCard) {
  if (p.kitStatus === 'available') return `from $${Math.round(Number(p.priceRange.minVariantPrice.amount))}`
  if (p.kitStatus === 'coming-soon') return 'Coming soon'
  return null
}

function filesLabel(p: ShopProductCard) {
  const set = setFor(p)
  if (!set) return null
  if (!set.paid) return 'Free'
  if (set.purchasable) return formatPrice(set.priceUsd)
  return 'Coming soon'
}

const visible = (p: ShopProductCard) =>
  filter.value === 'all'
  || (filter.value === 'kits' && p.kind === 'faction')
  || (filter.value === 'files' && !!p.setId)

const base = computed(() => (products.value ?? []).filter(p => p.group === 'base' && visible(p)))
const addons = computed(() => (products.value ?? []).filter(p => p.group === 'addon' && visible(p)))
</script>

<template>
  <div>
    <header class="border-b border-[color:var(--rule)] bg-[color:var(--paper-tint)]/60">
      <div class="container mx-auto px-4 py-10 md:py-14 grid md:grid-cols-[1.2fr_1fr] gap-8 items-center">
        <div>
          <p class="font-display uppercase tracking-[0.25em] text-[color:var(--gold)] text-sm mb-2">The Shop</p>
          <h1 class="font-display text-4xl md:text-5xl text-[color:var(--heading)]">Printed fleets and STL files</h1>
          <p class="mt-4 text-ink-soft max-w-xl">
            Every fleet comes as a printed kit we make to order at our home in Georgia, or as STL
            files you print yourself. The base game's files are free.
          </p>
        </div>
        <ul class="hidden sm:grid grid-cols-2 gap-3 text-sm">
          <li class="card-parchment p-3 flex gap-2 items-start">
            <UIcon name="i-lucide-hammer" class="size-5 text-[color:var(--gold)] shrink-0" />
            <span><b class="text-ink">Made to order</b><br><span class="text-ink-soft">About two weeks</span></span>
          </li>
          <li class="card-parchment p-3 flex gap-2 items-start">
            <UIcon name="i-lucide-truck" class="size-5 text-[color:var(--gold)] shrink-0" />
            <span><b class="text-ink">US shipping</b><br><span class="text-ink-soft">Packed by hand</span></span>
          </li>
          <li class="card-parchment p-3 flex gap-2 items-start">
            <UIcon name="i-lucide-download" class="size-5 text-[color:var(--gold)] shrink-0" />
            <span><b class="text-ink">Instant files</b><br><span class="text-ink-soft">Emailed download link</span></span>
          </li>
          <li class="card-parchment p-3 flex gap-2 items-start">
            <UIcon name="i-lucide-refresh-cw" class="size-5 text-[color:var(--gold)] shrink-0" />
            <span><b class="text-ink">Free updates</b><br><span class="text-ink-soft">When models change</span></span>
          </li>
        </ul>
      </div>
    </header>

    <div class="container mx-auto px-4 py-10">
      <div class="flex flex-wrap items-center gap-2" role="tablist" aria-label="Filter products">
        <button
          v-for="f in ([['all', 'Everything'], ['kits', 'Printed kits'], ['files', 'STL files']] as const)"
          :key="f[0]"
          type="button"
          role="tab"
          :aria-selected="filter === f[0]"
          class="px-4 py-1.5 rounded-full border text-sm transition"
          :class="filter === f[0] ? 'bg-[color:var(--heading)] text-[color:var(--paper)] border-[color:var(--heading)]' : 'border-[color:var(--rule)] text-ink-soft hover:text-ink hover:border-ink/50'"
          @click="filter = f[0]"
        >
          {{ f[1] }}
        </button>
      </div>

      <section v-if="base.length" class="mt-8">
        <div class="flex items-baseline justify-between gap-4">
          <h2 class="font-display text-2xl text-[color:var(--heading)]">The base game</h2>
          <p class="text-sm text-ink-soft hidden sm:block">Two fleets that are a good match for each other.</p>
        </div>
        <div class="mt-5 grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          <ShopProductTile
            v-for="p in base"
            :key="p.id"
            :product="p"
            :kit-label="kitLabel(p)"
            :files-label="filesLabel(p)"
            :stats="fleetCopy?.[p.faction]?.stats"
          />
        </div>
      </section>

      <section v-if="addons.length" class="mt-14">
        <div class="flex items-baseline justify-between gap-4">
          <h2 class="font-display text-2xl text-[color:var(--heading)]">Add-on fleets</h2>
          <p class="text-sm text-ink-soft hidden sm:block">In playtesting now. Each one plays with the free base set.</p>
        </div>
        <div class="mt-5 grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          <ShopProductTile
            v-for="p in addons"
            :key="p.id"
            :product="p"
            :kit-label="kitLabel(p)"
            :files-label="filesLabel(p)"
            :stats="fleetCopy?.[p.faction]?.stats"
          />
        </div>
      </section>

      <p class="mt-14 text-center text-sm text-ink-soft">
        Have a question first?
        <a href="https://discord.gg/DMuFEWJtZq" target="_blank" rel="noopener" class="underline text-[color:var(--gold)]">Ask on Discord</a>
        or join the <NuxtLink to="/#files" class="underline text-[color:var(--gold)]">mailing list</NuxtLink>.
      </p>
    </div>
  </div>
</template>
