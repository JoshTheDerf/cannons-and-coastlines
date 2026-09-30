<script setup lang="ts">
import type { ShopProductCard } from '~/composables/useShop'
import { findFleet, statLine } from '#shared/utils/fleets'

const { listProducts, cart, loadCart } = useShop()
const { data: products } = await useAsyncData('shop-products', () => listProducts())
const { data: setsData } = await useFleetSets()
// "3 frigates · 4 fittings · Move 3"; the full stats are on each fleet's page.
const statsFor = (p: ShopProductCard) => {
  const f = p.kind === 'faction' ? findFleet(p.handle) : null
  return f ? statLine(f) : undefined
}

onMounted(() => { if (!cart.value) loadCart() })

useSeoMeta({
  title: 'Shop',
  description: 'STL files for every Cannons & Coastlines fleet. The base game is free, and the five add-on fleets are $5 each at the early-bird price.'
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

// Every add-on fleet in one checkout. Stripe takes several line items, so
// this is the same checkout with more set ids, not a separate product.
const paidSets = computed(() => (setsData.value?.all ?? []).filter(s => s.purchasable))
const bundleTotal = computed(() => paidSets.value.reduce((n, s) => n + (s.priceUsd ?? 0), 0))
const earlyBird = computed(() => paidSets.value.some(s => s.earlyBird))
const filesCart = useFilesCart()
const allInCart = computed(() => paidSets.value.length > 0 && paidSets.value.every(s => filesCart.has(s.id)))
function addAll() {
  filesCart.addMany(paidSets.value.map(s => s.id))
  filesCart.open.value = true
}
const buyingAll = ref(false)
const buyAllError = ref('')
async function buyAll() {
  buyingAll.value = true
  buyAllError.value = ''
  try {
    await filesCart.checkout(paidSets.value.map(s => s.id), '/shop')
  } catch (e) {
    buyAllError.value = checkoutError(e)
    buyingAll.value = false
  }
}

const base = computed(() => (products.value ?? []).filter(p => p.group === 'base' && visible(p)))
const addons = computed(() => (products.value ?? []).filter(p => p.group === 'addon' && visible(p)))
</script>

<template>
  <div>
    <header class="border-b border-[color:var(--rule)] bg-[color:var(--paper-tint)]/60">
      <div class="container mx-auto px-4 py-10 md:py-14 grid md:grid-cols-[1.2fr_1fr] gap-8 items-center">
        <div>
          <p class="font-display uppercase tracking-[0.25em] text-[color:var(--gold)] text-sm mb-2">The Shop</p>
          <h1 class="font-display text-4xl md:text-5xl text-[color:var(--heading)]">STL files for every fleet</h1>
          <p class="mt-4 text-ink-soft max-w-xl">
            Print the fleets yourself. The base game's files are free, and each add-on fleet is
            <b class="text-ink">{{ formatPrice(paidSets[0]?.priceUsd ?? null) }}</b><template v-if="earlyBird"> at the early-bird price</template>.
            Printed kits, made to order at our home in Georgia, are coming soon.
          </p>
        </div>
        <ul class="hidden sm:grid grid-cols-2 gap-3 text-sm">
          <li class="card-parchment p-3 flex gap-2 items-start">
            <UIcon name="i-lucide-download" class="size-5 text-[color:var(--gold)] shrink-0" />
            <span><b class="text-ink">Instant files</b><br><span class="text-ink-soft">Right after checkout</span></span>
          </li>
          <li class="card-parchment p-3 flex gap-2 items-start">
            <UIcon name="i-lucide-printer" class="size-5 text-[color:var(--gold)] shrink-0" />
            <span><b class="text-ink">Print all you like</b><br><span class="text-ink-soft">For your own table</span></span>
          </li>
          <li class="card-parchment p-3 flex gap-2 items-start">
            <UIcon name="i-lucide-lock" class="size-5 text-[color:var(--gold)] shrink-0" />
            <span><b class="text-ink">Secure checkout</b><br><span class="text-ink-soft">Payments by Stripe</span></span>
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
            :stats="statsFor(p)"
          />
        </div>
      </section>

      <section v-if="addons.length" class="mt-14">
        <div class="flex items-baseline justify-between gap-4">
          <h2 class="font-display text-2xl text-[color:var(--heading)]">Add-on fleets</h2>
          <p class="text-sm text-ink-soft hidden sm:block">In playtesting now. Each one plays with the free base set.</p>
        </div>
        <div v-if="paidSets.length > 1" class="mt-5 card-parchment p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-4">
          <div class="flex-1">
            <p class="font-display text-lg text-ink">
              All {{ paidSets.length }} add-on fleets
              <span v-if="earlyBird" class="stamp stamp-gold ml-2 align-middle">Early bird price</span>
            </p>
            <p class="text-sm text-ink-soft">{{ paidSets.map(s => s.title).join(', ') }}. One checkout, and every fleet's files in one zip with the print guide.</p>
            <p v-if="buyAllError" class="mt-1 text-sm text-error-500">{{ buyAllError }}</p>
          </div>
          <div class="grid sm:grid-cols-2 gap-2 shrink-0">
            <UButton color="neutral" variant="outline" size="lg" :icon="allInCart ? 'i-lucide-check' : 'i-lucide-shopping-cart'" class="justify-center" @click="allInCart ? (filesCart.open.value = true) : addAll()">
              {{ allInCart ? 'All in your cart' : 'Add all to cart' }}
            </UButton>
            <UButton color="primary" size="lg" icon="i-lucide-download" :loading="buyingAll" class="justify-center" @click="buyAll">
              Buy all {{ paidSets.length }} · {{ formatPrice(bundleTotal) }}
            </UButton>
          </div>
        </div>
        <div class="mt-5 grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          <ShopProductTile
            v-for="p in addons"
            :key="p.id"
            :product="p"
            :kit-label="kitLabel(p)"
            :files-label="filesLabel(p)"
            :stats="statsFor(p)"
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
