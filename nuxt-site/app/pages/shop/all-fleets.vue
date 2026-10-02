<script setup lang="ts">
// /shop/all-fleets: every fleet's STL files in one checkout. It's the
// all-fleets bundle in server/data/sets.json, which isn't a product of its
// own: buying it is one order with every paid set in it, at the per-set
// prices, and an order like that gets the bundle zip (one folder per fleet,
// one print list) on its order page. The free base set comes with it.
import manifest from '~~/server/data/sets.json'
import { FLEETS, fleetPage, statLine } from '#shared/utils/fleets'
import { printListPath } from '~/composables/usePrintList'

const BUNDLE_ID = 'all-fleets'
const bundle = (manifest as { bundles: { id: string, includes: { set: string }[] }[] }).bundles.find(b => b.id === BUNDLE_ID)!

const { data: setsData } = await useFleetSets()
const inBundle = computed(() => (setsData.value?.all ?? []).filter(s => bundle.includes.some(i => i.set === s.id)))
const paid = computed(() => inBundle.value.filter(s => s.paid))
const buyable = computed(() => paid.value.filter(s => s.purchasable))
// The one-zip download needs every paid set in the order, so it's only
// promised while all of them are on sale.
const complete = computed(() => buyable.value.length > 0 && buyable.value.length === paid.value.length)
const total = computed(() => buyable.value.reduce((n, s) => n + (s.priceUsd ?? 0), 0))
const earlyBird = computed(() => buyable.value.some(s => s.earlyBird))
const each = computed(() => {
  const prices = [...new Set(buyable.value.map(s => s.priceUsd))]
  return prices.length === 1 ? formatPrice(prices[0]!) : null
})

const fleets = computed(() => FLEETS.filter(f => bundle.includes.some(i => i.set === f.set)))
const addons = computed(() => fleets.value.filter(f => f.group === 'addon'))
const setOf = (setId: string) => inBundle.value.find(s => s.id === setId) ?? null
const priceLabel = (setId: string) => {
  const s = setOf(setId)
  if (!s) return ''
  return !s.paid ? 'Free' : s.purchasable ? formatPrice(s.priceUsd) : 'Coming soon'
}

const words = (n: number) => ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'][n] ?? String(n)

useProductSeo({
  path: '/shop/all-fleets',
  social: BUNDLE_ID,
  title: 'Every Fleet: the complete set',
  description: `All ${words(fleets.value.length)} Cannons & Coastlines fleets as STL files: the ${words(addons.value.length)} add-on fleets and the free base game.`
    + (buyable.value.length ? ` ${formatPrice(total.value)}${earlyBird.value ? ' at the early-bird price' : ''}.` : ''),
  imageAlt: 'A ship from each of the seven fleets',
  offer: buyable.value.length ? { price: total.value, available: true } : null,
  sku: BUNDLE_ID
})

// ── Buying: the same checkout as the cart, with every paid set ──────────
const filesCart = useFilesCart()
const allInCart = computed(() => buyable.value.length > 0 && buyable.value.every(s => filesCart.has(s.id)))
const owned = computed(() => buyable.value.filter(s => filesCart.owned.value.includes(s.id)))
function addAll() {
  filesCart.addMany(buyable.value.map(s => s.id))
  filesCart.open.value = true
}
const buying = ref(false)
const error = ref('')
async function buyAll() {
  buying.value = true
  error.value = ''
  try {
    await filesCart.checkout(buyable.value.map(s => s.id), '/shop/all-fleets')
  } catch (e) {
    error.value = checkoutError(e)
    buying.value = false
  }
}
</script>

<template>
  <div class="container mx-auto px-4 py-8">
    <nav class="text-sm text-ink-soft flex items-center gap-1.5" aria-label="Breadcrumb">
      <NuxtLink to="/shop" class="hover:text-ink">Shop</NuxtLink>
      <UIcon name="i-lucide-chevron-right" class="size-3.5 text-ink-faint" />
      <span class="text-ink">Every Fleet</span>
    </nav>

    <div class="mt-5 grid lg:grid-cols-[1.25fr_1fr] gap-8 lg:gap-12 items-start">
      <!-- Every fleet's ship, one tile each -->
      <!-- Three across even on a phone, so the price is close to the top for
           someone arriving from a link. -->
      <ul class="grid grid-cols-3 gap-2 sm:gap-3 min-w-0" aria-label="The fleets in the set">
        <li
          v-for="(f, i) in fleets"
          :key="f.id"
          :class="i === 0 ? 'col-span-3' : ''"
        >
          <NuxtLink :to="fleetPage(f)" class="group block rounded-xl overflow-hidden border border-[color:var(--rule)]/70 tile-stage relative" :class="i === 0 ? 'aspect-[5/2] sm:aspect-[2/1]' : 'aspect-[4/3]'">
            <img :src="f.image" :alt="`A ${f.name} ship`" class="absolute inset-0 w-full h-full object-contain p-2 transition duration-500 group-hover:scale-[1.04]">
            <span class="absolute left-1.5 bottom-1.5 sm:left-2 sm:bottom-2 text-[0.65rem] sm:text-xs leading-tight font-display text-ink bg-[color:var(--paper-card)]/85 rounded px-1.5 sm:px-2 py-0.5">{{ f.name }}</span>
          </NuxtLink>
        </li>
      </ul>

      <!-- Buy box -->
      <div class="flex flex-col gap-5 min-w-0 lg:sticky lg:top-20">
        <div>
          <p class="text-xs uppercase tracking-[0.2em] text-[color:var(--gold)] font-semibold">The complete set · STL files</p>
          <h1 class="font-display text-3xl md:text-4xl text-[color:var(--heading)] mt-1">Every Fleet</h1>
          <p class="mt-2 text-ink-soft">
            All {{ words(fleets.length) }} fleets, ready to print: the {{ words(addons.length) }} add-on fleets, and the
            free base game they all play on. Enough ships for a big free-for-all, or a different matchup every game night.
          </p>
        </div>

        <div v-if="buyable.length" class="rounded-xl border border-[color:var(--rule)] bg-[color:var(--paper-card)] p-5">
          <div class="flex flex-wrap items-center gap-3">
            <p class="font-display text-3xl text-ink">{{ formatPrice(total) }}</p>
            <span v-if="earlyBird" class="stamp stamp-gold">Early bird price</span>
          </div>
          <p class="mt-1 text-sm text-ink-soft">
            <template v-if="each">{{ each }} for each add-on fleet, and the base set is free.</template>
            One checkout, and you download right after it.
          </p>
          <div class="mt-4 grid gap-2">
            <UButton color="primary" size="xl" icon="i-lucide-download" block class="justify-center" :loading="buying" @click="buyAll">
              Buy {{ complete ? 'every fleet' : `all ${words(buyable.length)}` }} · {{ formatPrice(total) }}
            </UButton>
            <UButton color="neutral" variant="outline" size="lg" block class="justify-center" :icon="allInCart ? 'i-lucide-check' : 'i-lucide-shopping-cart'" @click="allInCart ? (filesCart.open.value = true) : addAll()">
              {{ allInCart ? 'All in your cart' : 'Add them all to cart' }}
            </UButton>
          </div>
          <p v-if="error" class="mt-2 text-sm text-error-500">{{ error }}</p>
          <p v-if="owned.length" class="mt-2 text-xs text-ink-faint">
            You've bought {{ owned.map(s => s.title).join(', ') }} on this device before. To skip
            {{ owned.length === 1 ? 'it' : 'them' }}, add the others from their own pages.
          </p>
          <p class="mt-3 text-xs text-ink-faint">
            For your own prints only. See the <NuxtLink to="/terms#paid-models-add-on-fleets" class="underline">license</NuxtLink>.
          </p>
          <p class="mt-5 pt-4 border-t border-[color:var(--rule)]/70 text-sm text-ink-soft">
            Already bought them? Your download link is in your Stripe receipt email. Lost it? Email
            <a href="mailto:josh@thederf.com" class="underline text-[color:var(--gold)]">josh@thederf.com</a>
            with the address you paid with.
          </p>
        </div>
        <div v-else class="rounded-xl border border-[color:var(--rule)] bg-[color:var(--paper-card)] p-5">
          <span class="stamp stamp-gold">Coming soon</span>
          <p class="mt-3 text-sm text-ink-soft">
            The add-on fleets aren't on sale yet.
            <NuxtLink to="/#files" class="text-[color:var(--gold)] hover:underline">The mailing list</NuxtLink>
            hears first when they are.
          </p>
        </div>

        <ul class="text-sm text-ink-soft grid gap-1.5">
          <li v-if="complete" class="flex gap-2"><UIcon name="i-lucide-folder-archive" class="size-4 mt-0.5 text-[color:var(--gold)] shrink-0" /> Every fleet in one zip, with one print list for all of them. Or download them one at a time.</li>
          <li class="flex gap-2"><UIcon name="i-lucide-printer" class="size-4 mt-0.5 text-[color:var(--gold)] shrink-0" /> Print as many as you like, in any color.</li>
          <li class="flex gap-2"><UIcon name="i-lucide-refresh-cw" class="size-4 mt-0.5 text-[color:var(--gold)] shrink-0" /> Free re-downloads when the models change.</li>
          <li class="flex gap-2"><UIcon name="i-lucide-lock" class="size-4 mt-0.5 text-[color:var(--gold)] shrink-0" /> Secure checkout by Stripe.</li>
        </ul>

        <div class="flex flex-wrap gap-2">
          <UButton :to="printListPath(BUNDLE_ID)" icon="i-lucide-list-checks" variant="ghost" color="neutral" size="sm">
            Print list
          </UButton>
          <UButton to="/print-guide" icon="i-lucide-printer" variant="ghost" color="neutral" size="sm">
            Print guide
          </UButton>
        </div>
      </div>
    </div>

    <section class="mt-16">
      <h2 class="font-display text-2xl text-[color:var(--heading)]">What's in the set</h2>
      <p class="mt-1 text-sm text-ink-soft">Each fleet's page has its full stats, its ability and its faction card.</p>
      <ul class="mt-3 divide-y divide-[color:var(--rule)]/60">
        <li v-for="f in fleets" :key="f.id" class="py-4 grid grid-cols-[5.5rem_1fr_auto] sm:grid-cols-[7rem_1fr_auto] gap-4 items-center">
          <NuxtLink :to="fleetPage(f)"><img :src="f.image" :alt="f.name" loading="lazy" class="w-full aspect-[4/3] object-contain"></NuxtLink>
          <div class="min-w-0">
            <NuxtLink :to="fleetPage(f)" class="font-display text-lg text-ink hover:text-[color:var(--heading)]">{{ f.name }}</NuxtLink>
            <p class="text-sm text-ink-faint">{{ statLine(f) }}</p>
            <p class="mt-1 font-serif text-sm text-ink-soft">{{ f.summary }}</p>
          </div>
          <p class="text-sm whitespace-nowrap" :class="setOf(f.set)?.paid ? 'font-semibold text-ink' : 'text-ink-soft'">{{ priceLabel(f.set) }}</p>
        </li>
      </ul>
      <p class="mt-2 text-sm text-ink-soft">
        The base set also has the islands, rocks, reefs and coins, and the masts, cannons and wheels the add-on fleets share.
      </p>
    </section>
  </div>
</template>

<style scoped>
.tile-stage {
  background: radial-gradient(120% 90% at 50% 35%, #fbf7ee 0%, #efe6d3 65%, #e2d5bb 100%);
}
</style>
