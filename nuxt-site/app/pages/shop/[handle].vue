<script setup lang="ts">
import type { ShopVariant } from '~/composables/useShop'
import assemblies from '#shared/data/ship-assemblies.json'

const route = useRoute()
const handle = computed(() => String(route.params.handle))
const { getProduct, listProducts, addToCart, cart, loadCart } = useShop()

const { data: product } = await useAsyncData(
  () => `shop-product-${handle.value}`,
  () => getProduct(handle.value),
  { watch: [handle] }
)

if (!product.value) throw createError({ statusCode: 404, statusMessage: 'Product not found' })

// Old handles (…-starter-set, …-files) resolve to the same product; send
// them to the canonical URL so shared links keep working and search engines
// settle on one address.
if (product.value.handle !== handle.value) {
  await navigateTo({ path: `/shop/${product.value.handle}`, query: route.query }, { redirectCode: 301, replace: true })
}

useSeoMeta({
  title: product.value.title,
  description: product.value.tagline,
  ogImage: product.value.featuredImage.url
})

const { data: allProducts } = await useAsyncData('shop-products-list', () => listProducts())
const { data: setsData } = await useFleetSets()
const { data: fleetCopy } = await useFleetCopy()

const fleet = computed(() => fleetCopy.value?.[product.value!.faction] ?? null)
const suggestions = computed(() => {
  const all = allProducts.value ?? []
  return product.value!.pairings
    .map(p => ({ pairing: p, product: all.find(x => x.handle === p.with) }))
    .filter(s => s.product)
})
const moreFleets = computed(() =>
  (allProducts.value ?? []).filter(p => p.kind === 'faction' && p.handle !== product.value!.handle).slice(0, 6)
)

// ── The two ways to buy ────────────────────────────────────────────────
// A printed kit (Shopify variants, colors, shipping) and the STL files
// (server/data/sets.json, Stripe, an emailed download). Either can be
// unavailable (add-on kits aren't boxed yet, and unreleased files are Coming
// Soon), so both are always described and only the buyable one is primary.
const digital = computed(() => setsData.value?.all.find(s => s.id === product.value?.setId) ?? null)
const hasKit = computed(() => product.value!.kitStatus !== 'none')
const kitBuyable = computed(() => product.value!.kitStatus === 'available' && product.value!.variants.length > 0)
const filesBuyable = computed(() => !!digital.value && (!digital.value.paid || digital.value.purchasable))

const justPurchased = computed(() => route.query.purchased === '1')
const format = ref<'kit' | 'files'>(
  justPurchased.value || route.query.format === 'files' || !hasKit.value || (!kitBuyable.value && filesBuyable.value)
    ? 'files' : 'kit'
)

const initialVariant = product.value.variants.find(v => v.availableForSale) ?? product.value.variants[0]
const selectedVariant = ref<ShopVariant | undefined>(initialVariant)
const quantity = ref(1)
const adding = ref(false)
const justAdded = ref(false)

const unitPrice = computed(() => Number(selectedVariant.value?.price.amount ?? 0))
const totalPrice = computed(() => (unitPrice.value * quantity.value).toFixed(2))
const kitPrice = computed(() => product.value!.variants.length ? `$${Math.round(unitPrice.value)}` : null)
const filesPrice = computed(() => {
  const d = digital.value
  if (!d) return null
  if (!d.paid) return 'Free'
  return d.purchasable ? formatPrice(d.priceUsd) : null
})

onMounted(() => { if (!cart.value) loadCart() })

async function addNow() {
  if (!selectedVariant.value?.availableForSale) return
  adding.value = true
  try {
    await addToCart(selectedVariant.value.id, quantity.value)
    justAdded.value = true
    setTimeout(() => { justAdded.value = false }, 2200)
  } finally {
    adding.value = false
  }
}

async function buyNow() {
  if (!selectedVariant.value?.availableForSale) return
  await addToCart(selectedVariant.value.id, quantity.value)
  await navigateTo('/shop/cart')
}

// Stripe returns the buyer here with ?purchased=1. The entitlement is granted
// by the webhook, not the redirect, so promise an email rather than a file.
const buyingFiles = ref(false)
const filesError = ref('')
async function buyFiles() {
  buyingFiles.value = true
  filesError.value = ''
  try {
    const { url } = await $fetch<{ url: string }>('/api/checkout', { method: 'POST', body: { setId: digital.value!.id } })
    await navigateTo(url, { external: true })
  } catch (e: any) {
    filesError.value = e?.data?.statusMessage ?? 'Could not start checkout. Please try again.'
    buyingFiles.value = false
  }
}

const email = ref('')
const sending = ref(false)
const sendMessage = ref('')
async function resend() {
  sending.value = true
  sendMessage.value = ''
  try {
    const res = await $fetch<{ message: string }>('/api/download-link', { method: 'POST', body: { setId: digital.value!.id, email: email.value } })
    sendMessage.value = res.message
  } catch (e: any) {
    sendMessage.value = e?.data?.statusMessage ?? 'Something went wrong. Please try again.'
  } finally {
    sending.value = false
  }
}

// ── Gallery: the assembled 3D ship first, then photos and the card ─────
const has3d = computed(() => !!product.value!.assembly)
const media = ref<'3d' | string>(has3d.value ? '3d' : (product.value.images[0]?.url ?? product.value.featuredImage.url))
// The printed kit recolors the hull to the chosen filament; the files view
// shows the fleet in the filament it is designed for.
const hullColor = computed(() => format.value === 'kit' && kitBuyable.value ? selectedVariant.value?.swatch ?? null : null)

// ── Kit contents, counted from the assembly ────────────────────────────
const PART_NAMES: Record<string, string> = {
  'mast': 'Mast', 'mast-short': 'Short mast', 'cannon': 'Cannon', 'cargo': 'Cargo', 'barrel': 'Barrel',
  'movement-wheel': 'Movement wheel', 'sail': 'Sail', 'sail-damaged': 'Torn sail',
  'sail-treasure-fleet': 'Treasure Fleet sail', 'sail-stone-fleet': 'Stone Fleet sail', 'sail-islanders': 'Islander sail',
  'industry-turret': 'Turret', 'industry-smokestack': 'Smokestack',
  'rock1': 'Rock', 'reef': 'Reef', 'island-topper': 'Island topper',
  'cannonball': 'Cannonball', 'coins': 'Coins'
}
// Every piece has a gallery render at assets/images/renders/<stem>.png
// (npx jake renders). Those are cached as immutable, so a piece re-rendered
// in place carries a version here, as in content/pages/parts.yml.
const RENDER_VERSION: Record<string, string> = {
  'mast': '?v=0.5', 'cannon': '?v=0.5', 'cargo': '?v=0.5', 'movement-wheel': '?v=0.5',
  'ship-queens-fleet': '?v=0.5', 'ship-corsair': '?v=0.5', 'ship-shadow-fleet': '?v=2',
  'cannonball': '?v=3', 'rock1': '?v=2', 'reef': '?v=2', 'sail-damaged': '?v=2',
  'sail-stone-fleet': '?v=2', 'sail-islanders': '?v=2'
}
// "coins" is the whole bag, pictured by one of its coins.
const render = (stem: string) => stem === 'coins'
  ? '/assets/images/renders/coin-skilled-gunner.png'
  : `/assets/images/renders/${stem}.png${RENDER_VERSION[stem] ?? ''}`

// A printed kit is `kitShips` ships, each carrying what its placements put
// on one hull, plus the kit-wide extras and the coastline, all from
// shared/data/ship-assemblies.json. The cannon and coin placed on the 3D
// model are not extra pieces: cannons are counted per kit (players move them
// between slots) and the coin is one of the bag's twenty.
type Row = { name: string, count: number, img: string, note?: string }
const kitContents = computed((): Row[] => {
  const asm = assemblies as any
  const key = product.value!.assembly
  const ship = key ? asm.ships[key] : undefined
  if (!ship || product.value!.kind === 'download') return []
  const n: number = ship.kitShips ?? 1
  const hullStem = ship.hull.source.split('/').pop()!.replace('.stl', '')
  const rows: Row[] = [{ name: 'Hull', count: n, img: render(hullStem) }]
  for (const f of ship.fittings ?? []) rows.push({ name: PART_NAMES[f.name] ?? f.name, count: n, img: render(f.name) })
  const perShip = new Map<string, number>()
  for (const p of ship.placements as { part: string }[]) {
    if (p.part === 'cannon' || p.part.startsWith('coin-')) continue
    perShip.set(p.part, (perShip.get(p.part) ?? 0) + 1)
  }
  for (const [part, c] of perShip) rows.push({ name: PART_NAMES[part] ?? part, count: c * n, img: render(part) })
  for (const e of asm.kit.extras as { part: string, count: number, note?: string }[]) {
    rows.push({ name: PART_NAMES[e.part] ?? e.part, count: e.count, img: render(e.part), note: e.note })
  }
  const terrain = new Map<string, number>()
  for (const t of asm.scene.terrain as { part: string }[]) terrain.set(t.part, (terrain.get(t.part) ?? 0) + 1)
  for (const [part, c] of terrain) rows.push({ name: PART_NAMES[part] ?? part, count: c, img: render(part) })
  return rows
})
</script>

<template>
  <div v-if="product" class="container mx-auto px-4 py-8">
    <nav class="text-sm text-ink-soft flex items-center gap-1.5" aria-label="Breadcrumb">
      <NuxtLink to="/shop" class="hover:text-ink">Shop</NuxtLink>
      <UIcon name="i-lucide-chevron-right" class="size-3.5 text-ink-faint" />
      <span>{{ product.group === 'base' ? 'Base game' : 'Add-on fleets' }}</span>
      <UIcon name="i-lucide-chevron-right" class="size-3.5 text-ink-faint" />
      <span class="text-ink">{{ product.title }}</span>
    </nav>

    <div class="mt-5 grid lg:grid-cols-[1.25fr_1fr] gap-8 lg:gap-12 items-start">
      <!-- Gallery -->
      <div class="lg:sticky lg:top-20">
        <div class="rounded-xl overflow-hidden border border-[color:var(--rule)]/70 aspect-[4/3] bg-[color:var(--paper-card)] flex items-center justify-center">
          <ClientOnly v-if="media === '3d' && product.assembly">
            <ShipPreview
              :ship="product.assembly"
              :hull-color="hullColor"
              :alt="`${product.title}, fully assembled, in 3D`"
            />
            <template #fallback>
              <div class="text-ink-faint text-sm">Loading 3D preview…</div>
            </template>
          </ClientOnly>
          <img v-else :src="media" :alt="product.featuredImage.altText" class="w-full h-full object-contain">
        </div>

        <div class="mt-3 flex gap-2 overflow-x-auto pb-1">
          <button
            v-if="has3d"
            type="button"
            class="shrink-0 size-20 rounded-lg border-2 flex flex-col items-center justify-center gap-1 text-xs transition bg-[color:var(--paper-card)]"
            :class="media === '3d' ? 'border-[color:var(--gold)] text-ink' : 'border-transparent text-ink-soft hover:border-ink/40'"
            @click="media = '3d'"
          >
            <UIcon name="i-lucide-rotate-3d" class="size-6" /> 3D
          </button>
          <button
            v-for="img in product.images"
            :key="img.url"
            type="button"
            class="shrink-0 size-20 rounded-lg overflow-hidden border-2 transition bg-[color:var(--paper-card)]"
            :class="media === img.url ? 'border-[color:var(--gold)]' : 'border-transparent hover:border-ink/40'"
            :aria-label="img.altText"
            @click="media = img.url"
          >
            <img :src="img.url" :alt="img.altText" class="w-full h-full object-cover">
          </button>
        </div>
      </div>

      <!-- Buy box -->
      <div class="flex flex-col gap-5">
        <div>
          <p class="text-xs uppercase tracking-[0.2em] text-[color:var(--gold)] font-semibold">
            {{ product.kind === 'download' ? 'Free download' : product.group === 'base' ? 'Base game fleet' : 'Add-on fleet' }}
          </p>
          <h1 class="font-display text-3xl md:text-4xl text-[color:var(--heading)] mt-1">{{ product.title }}</h1>
          <p class="mt-2 text-ink-soft">{{ product.tagline }}</p>
          <ul v-if="fleet?.stats.length" class="mt-3 flex flex-wrap gap-1.5">
            <li v-for="s in fleet.stats" :key="s" class="text-xs px-2.5 py-1 rounded-full bg-[color:var(--paper-tint)] text-ink-soft">{{ s }}</li>
          </ul>
          <div v-if="fleet?.ability" class="mt-3 callout text-sm">
            <b class="text-ink">{{ fleet.ability }}.</b> <span class="text-ink-soft">{{ fleet.abilityBody }}</span>
          </div>
        </div>

        <div v-if="justPurchased" class="rounded-xl border border-success-400/30 bg-success-500/15 p-4 text-sm text-ink">
          <p class="font-semibold">Payment received. Thank you.</p>
          <p class="text-ink-soft mt-1">Your download link is on its way to the email you paid with. If it hasn't arrived in a few minutes, request another one below.</p>
        </div>

        <!-- Format choice: both options are always visible and priced. -->
        <div v-if="hasKit && digital" class="grid grid-cols-2 gap-3" role="radiogroup" aria-label="How do you want it?">
          <button
            type="button"
            role="radio"
            :aria-checked="format === 'kit'"
            class="text-left rounded-xl border-2 p-3.5 transition bg-[color:var(--paper-card)]"
            :class="format === 'kit' ? 'border-[color:var(--gold)] shadow-sm' : 'border-[color:var(--rule)]/70 hover:border-ink/40'"
            @click="format = 'kit'"
          >
            <span class="flex items-center gap-1.5 text-sm text-ink-soft"><UIcon name="i-lucide-package" class="size-4" /> Printed kit</span>
            <span class="block mt-1 font-display text-xl text-ink">{{ kitPrice ?? 'Coming soon' }}</span>
            <span class="block text-xs text-ink-faint">{{ kitBuyable ? 'Made to order, shipped' : 'Not boxed yet' }}</span>
          </button>
          <button
            type="button"
            role="radio"
            :aria-checked="format === 'files'"
            class="text-left rounded-xl border-2 p-3.5 transition bg-[color:var(--paper-card)]"
            :class="format === 'files' ? 'border-[color:var(--gold)] shadow-sm' : 'border-[color:var(--rule)]/70 hover:border-ink/40'"
            @click="format = 'files'"
          >
            <span class="flex items-center gap-1.5 text-sm text-ink-soft"><UIcon name="i-lucide-download" class="size-4" /> STL files</span>
            <span class="block mt-1 font-display text-xl text-ink">{{ filesPrice ?? 'Coming soon' }}</span>
            <span class="block text-xs text-ink-faint">{{ filesBuyable ? 'Print it yourself' : 'In playtesting' }}</span>
          </button>
        </div>

        <!-- Printed kit -->
        <template v-if="format === 'kit' && hasKit">
          <template v-if="kitBuyable && selectedVariant">
            <div>
              <p class="text-sm text-ink-soft mb-2">
                Hull color: <span class="text-ink font-semibold">{{ selectedVariant.title }}</span>
                <span v-if="!selectedVariant.availableForSale" class="ml-2 text-error-500">(sold out)</span>
              </p>
              <div class="flex flex-wrap gap-2">
                <button
                  v-for="v in product.variants"
                  :key="v.id"
                  type="button"
                  class="size-10 rounded-full border-2 transition relative"
                  :class="[
                    selectedVariant.id === v.id ? 'border-[color:var(--gold)] ring-2 ring-[color:var(--gold-dim)]' : 'border-ink/20 hover:border-ink/50',
                    !v.availableForSale && 'opacity-40'
                  ]"
                  :style="{ background: v.swatch }"
                  :title="`${v.title}${v.availableForSale ? '' : ' (sold out)'}`"
                  :aria-label="v.title"
                  :aria-pressed="selectedVariant.id === v.id"
                  @click="selectedVariant = v"
                >
                  <span v-if="!v.availableForSale" class="absolute inset-0 flex items-center justify-center text-ink text-lg">×</span>
                </button>
              </div>
            </div>

            <div class="flex flex-wrap items-center gap-3">
              <div class="inline-flex items-center rounded-lg border border-[color:var(--rule)] bg-[color:var(--paper-card)]" aria-label="Quantity">
                <button type="button" class="px-3 py-2.5 text-ink-soft hover:text-ink" aria-label="One fewer" @click="quantity = Math.max(1, quantity - 1)">−</button>
                <input v-model.number="quantity" type="number" min="1" class="w-10 text-center bg-transparent text-ink py-2 focus:outline-none" aria-label="Quantity">
                <button type="button" class="px-3 py-2.5 text-ink-soft hover:text-ink" aria-label="One more" @click="quantity = quantity + 1">+</button>
              </div>
              <UButton color="primary" size="xl" icon="i-lucide-shopping-cart" class="flex-1 justify-center" :loading="adding" :disabled="!selectedVariant.availableForSale" @click="addNow">
                {{ justAdded ? 'Added to cart' : `Add to cart · $${totalPrice}` }}
              </UButton>
            </div>
            <UButton color="neutral" variant="outline" size="lg" block :disabled="!selectedVariant.availableForSale" @click="buyNow">
              Buy it now
            </UButton>
            <NuxtLink v-if="cart && cart.totalQuantity > 0" to="/shop/cart" class="self-center text-sm text-[color:var(--gold)] hover:underline flex items-center gap-1.5">
              <UIcon name="i-lucide-shopping-cart" class="size-4" /> View cart ({{ cart.totalQuantity }})
            </NuxtLink>
            <ul class="text-sm text-ink-soft grid gap-1.5">
              <li class="flex gap-2"><UIcon name="i-lucide-hammer" class="size-4 mt-0.5 text-[color:var(--gold)]" /> Printed and packed by hand. Made to order, so allow about two weeks.</li>
              <li class="flex gap-2"><UIcon name="i-lucide-truck" class="size-4 mt-0.5 text-[color:var(--gold)]" /> US shipping only for now.</li>
              <li v-if="digital && !digital.paid" class="flex gap-2"><UIcon name="i-lucide-gift" class="size-4 mt-0.5 text-[color:var(--gold)]" /> The files are free too, if you'd rather print your own.</li>
            </ul>
          </template>
          <div v-else class="rounded-xl border border-[color:var(--rule)] bg-[color:var(--paper-card)] p-5">
            <span class="stamp stamp-gold">Printed kit coming soon</span>
            <p class="mt-3 text-sm text-ink-soft">
              We're still playtesting this fleet before we box it.
              <NuxtLink to="/#files" class="text-[color:var(--gold)] hover:underline">The mailing list</NuxtLink>
              hears first when it's ready.
            </p>
          </div>
        </template>

        <!-- STL files -->
        <template v-else-if="digital">
          <div v-if="!digital.paid" class="rounded-xl border border-[color:var(--rule)] bg-[color:var(--paper-card)] p-5">
            <p class="font-display text-2xl text-ink">Free</p>
            <p class="mt-1 text-sm text-ink-soft">Part of the free base set: both base fleets, terrain and coins. Licensed CC BY-NC-SA.</p>
            <UButton v-if="digital.freeDownloadUrl" :to="digital.freeDownloadUrl" class="mt-4" size="xl" color="primary" icon="i-lucide-download" block>
              Download the STLs
            </UButton>
            <NuxtLink to="/parts" class="mt-3 inline-block text-sm text-[color:var(--gold)] hover:underline">What's in the pack and how to print it →</NuxtLink>
          </div>

          <div v-else-if="digital.purchasable" class="rounded-xl border border-[color:var(--rule)] bg-[color:var(--paper-card)] p-5">
            <p class="font-display text-2xl text-ink">{{ formatPrice(digital.priceUsd) }}</p>
            <p class="mt-1 text-sm text-ink-soft">Buy once and print as many as you like. Re-downloads are free when the models change.</p>
            <UButton class="mt-4" size="xl" color="primary" icon="i-lucide-download" block :loading="buyingFiles" @click="buyFiles">
              Buy the files
            </UButton>
            <p v-if="filesError" class="mt-2 text-sm text-error-500">{{ filesError }}</p>
            <p class="mt-2 text-xs text-ink-faint">
              For your own prints only. See the <NuxtLink to="/terms#paid-models-add-on-fleets" class="underline">license</NuxtLink>.
            </p>
            <div class="mt-5 pt-4 border-t border-[color:var(--rule)]/70">
              <p class="text-sm text-ink-soft">Already bought this?</p>
              <form class="mt-2 flex flex-col sm:flex-row gap-2" @submit.prevent="resend">
                <UInput v-model="email" type="email" required placeholder="you@example.com" class="flex-1" />
                <UButton type="submit" color="neutral" variant="outline" :loading="sending">Send link</UButton>
              </form>
              <p v-if="sendMessage" class="mt-2 text-sm text-ink-soft">{{ sendMessage }}</p>
            </div>
          </div>

          <div v-else class="rounded-xl border border-[color:var(--rule)] bg-[color:var(--paper-card)] p-5">
            <span class="stamp stamp-gold">Files coming soon</span>
            <p class="mt-3 text-sm text-ink-soft">
              Still being modeled and playtested.
              <NuxtLink to="/#files" class="text-[color:var(--gold)] hover:underline">The mailing list</NuxtLink>
              hears first when it's out.
            </p>
          </div>
        </template>

        <div class="flex flex-wrap gap-2">
          <UButton v-if="digital?.factionCard" :to="digital.factionCard" target="_blank" icon="i-lucide-file-text" variant="ghost" color="neutral" size="sm">
            Faction card (PDF)
          </UButton>
          <UButton to="/rulebook/pdf/rulebook.pdf" target="_blank" icon="i-lucide-book-open" variant="ghost" color="neutral" size="sm">
            Rulebook (PDF)
          </UButton>
        </div>
      </div>
    </div>

    <!-- What you get -->
    <section class="mt-16">
      <h2 class="font-display text-2xl text-[color:var(--heading)]">{{ product.kind === 'download' ? "What's in the pack" : "What you get" }}</h2>
      <div class="mt-5 grid md:grid-cols-3 gap-5">
        <div v-for="inc in product.includes" :key="inc.title" class="card-parchment p-5">
          <h3 class="font-display text-lg text-ink flex items-center gap-2">
            <UIcon :name="inc.icon" class="size-5 text-[color:var(--gold)]" /> {{ inc.title }}
          </h3>
          <ul class="mt-3 space-y-1.5 text-sm text-ink-soft">
            <li v-for="(it, i) in inc.items" :key="i" class="flex gap-2">
              <span class="text-[color:var(--gold)]">•</span><span>{{ it }}</span>
            </li>
          </ul>
        </div>
      </div>
    </section>

    <section v-if="hasKit && kitContents.length" class="mt-12">
      <h2 class="font-display text-2xl text-[color:var(--heading)]">Kit contents</h2>
      <p class="mt-1 text-sm text-ink-soft">
        Everything in the printed kit.<template v-if="!kitBuyable"> (It's planned, but we haven't boxed this one yet.)</template>
      </p>
      <ul class="mt-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <li v-for="row in kitContents" :key="`${row.name}|${row.note ?? ''}`" class="card-parchment p-3 flex flex-col items-center text-center">
          <div class="size-20 flex items-center justify-center">
            <img :src="row.img" :alt="row.name" loading="lazy" class="max-h-full max-w-full object-contain">
          </div>
          <p class="mt-2 text-sm text-ink">{{ row.name }}</p>
          <p class="text-xs text-ink-faint">× {{ row.count }}</p>
          <p v-if="row.note" class="mt-1 text-[0.7rem] leading-snug text-ink-soft">{{ row.note }}</p>
        </li>
      </ul>
    </section>

    <section class="mt-12 max-w-3xl">
      <h2 class="font-display text-2xl text-[color:var(--heading)] mb-2">About {{ product.kind === 'download' ? 'the files' : 'this fleet' }}</h2>
      <p class="text-ink-soft">{{ product.description }}</p>
    </section>

    <section v-if="suggestions.length" class="mt-14">
      <h2 class="font-display text-2xl text-[color:var(--heading)]">Something to shoot at</h2>
      <p class="mt-1 text-sm text-ink-soft">A second fleet makes it a game.</p>
      <div class="mt-5 grid md:grid-cols-2 gap-5">
        <article v-for="s in suggestions" :key="s.product!.id" class="card-parchment overflow-hidden flex flex-col sm:flex-row">
          <NuxtLink :to="`/shop/${s.product!.handle}`" class="sm:w-48 shrink-0 block tile-stage">
            <img :src="s.product!.featuredImage.url" :alt="s.product!.featuredImage.altText" class="w-full h-full object-contain p-2 aspect-[4/3] sm:aspect-auto">
          </NuxtLink>
          <div class="p-5 flex flex-col gap-2 flex-1">
            <p class="text-xs uppercase tracking-[0.2em] text-[color:var(--gold)] font-semibold">{{ s.pairing.title }}</p>
            <h3 class="font-display text-xl text-ink">
              <NuxtLink :to="`/shop/${s.product!.handle}`" class="hover:text-[color:var(--heading)]">{{ s.product!.title }}</NuxtLink>
            </h3>
            <p class="text-sm text-ink-soft">{{ s.pairing.blurb }}</p>
            <div class="mt-auto pt-2">
              <UButton :to="`/shop/${s.product!.handle}`" color="primary" variant="soft" size="sm" icon="i-lucide-arrow-right" trailing>
                View fleet
              </UButton>
            </div>
          </div>
        </article>
      </div>
    </section>

    <section class="mt-14">
      <h2 class="font-display text-xl text-[color:var(--heading)]">More fleets</h2>
      <div class="mt-4 flex gap-3 overflow-x-auto pb-2">
        <NuxtLink
          v-for="p in moreFleets"
          :key="p.id"
          :to="`/shop/${p.handle}`"
          class="shrink-0 w-44 card-parchment overflow-hidden hover:-translate-y-0.5 transition"
        >
          <div class="aspect-[4/3] tile-stage flex items-center justify-center">
            <img :src="p.featuredImage.url" :alt="p.featuredImage.altText" loading="lazy" class="max-h-full max-w-full object-contain p-2">
          </div>
          <p class="px-3 py-2 text-sm text-ink font-display">{{ p.title }}</p>
        </NuxtLink>
      </div>
    </section>
  </div>
</template>

<style scoped>
.tile-stage {
  background: radial-gradient(120% 90% at 50% 35%, #fbf7ee 0%, #efe6d3 65%, #e2d5bb 100%);
}
</style>
