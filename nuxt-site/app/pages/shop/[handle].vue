<script setup lang="ts">
import type { ShopVariant } from '~/composables/useShop'

const route = useRoute()
const handle = computed(() => String(route.params.handle))
const { getProduct, listProducts, addToCart, cart, loadCart } = useShop()

const { data: product } = await useAsyncData(
  () => `shop-product-${handle.value}`,
  () => getProduct(handle.value),
  { watch: [handle] }
)

if (!product.value) throw createError({ statusCode: 404, statusMessage: 'Product not found' })

useSeoMeta({
  title: product.value.title,
  description: product.value.tagline,
  ogImage: product.value.featuredImage.url
})

// Pull all products once, then resolve pairings to actual product cards.
const { data: allProducts } = await useAsyncData('shop-products-list', () => listProducts())
const suggestions = computed(() => {
  const all = allProducts.value ?? []
  return product.value!.pairings
    .map(p => ({ pairing: p, product: all.find(x => x.handle === p.with) }))
    .filter(s => s.product)
})

// A faction can be sold two ways and the page shows both on one set of tabs:
// a printed box (Shopify variants, colors, shipping) and the STL files
// (server/data/sets.json, Stripe, an emailed download). Either half can be
// missing — add-on factions have no box yet, and a faction whose files are
// still unreleased shows Coming Soon — so neither is assumed to exist.
const { data: setsData } = await useFleetSets()
const digital = computed(() =>
  setsData.value?.all.find(s => s.id === product.value?.setId) ?? null
)

const hasPhysical = computed(() => product.value!.variants.length > 0)
const hasDigital = computed(() => digital.value !== null)

// Default to whichever is actually buyable, preferring the box when both are.
const format = ref<'physical' | 'digital'>(hasPhysical.value ? 'physical' : 'digital')

// undefined for a digital-only faction: there are no variants to pick from.
const initialVariant = product.value.variants.find(v => v.availableForSale) ?? product.value.variants[0]
const selectedVariant = ref<ShopVariant | undefined>(initialVariant)
const quantity = ref(1)
const activeImage = ref(product.value.images[0]?.url ?? product.value.featuredImage.url)
const view = ref<'photo' | '3d'>('photo')
const adding = ref(false)
const justAdded = ref(false)

const unitPrice = computed(() => Number(selectedVariant.value?.price.amount ?? 0))
const totalPrice = computed(() => (unitPrice.value * quantity.value).toFixed(2))

onMounted(() => { if (!cart.value) loadCart() })

async function addNow() {
  if (!selectedVariant.value?.availableForSale) return
  adding.value = true
  try {
    await addToCart(selectedVariant.value!.id, quantity.value)
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

// ── Digital: Stripe checkout, and re-sending a link to a past buyer ──
// Stripe returns the buyer here with ?purchased=1. The entitlement is granted
// by the webhook rather than by that redirect, so the page promises an email
// instead of a file; the two can land seconds apart.
const justPurchased = computed(() => route.query.purchased === '1')
if (justPurchased.value) format.value = 'digital'

const buyingFiles = ref(false)
const filesError = ref('')

async function buyFiles() {
  buyingFiles.value = true
  filesError.value = ''
  try {
    const { url } = await $fetch<{ url: string }>('/api/checkout', {
      method: 'POST',
      body: { setId: digital.value!.id }
    })
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
    const res = await $fetch<{ message: string }>('/api/download-link', {
      method: 'POST',
      body: { setId: digital.value!.id, email: email.value }
    })
    sendMessage.value = res.message
  } catch (e: any) {
    sendMessage.value = e?.data?.statusMessage ?? 'Something went wrong. Please try again.'
  } finally {
    sending.value = false
  }
}
</script>

<template>
  <div v-if="product" class="py-12 px-4 container mx-auto">
    <NuxtLink to="/shop" class="text-sm text-white/60 hover:text-white">← All starter sets</NuxtLink>

    <div class="mt-6 grid lg:grid-cols-[1.1fr_1fr] gap-10">
      <!-- Gallery -->
      <div>
        <!-- View toggle -->
        <div v-if="product.modelUrl" class="mb-3 inline-flex rounded-lg border border-white/15 bg-secondary-900/60 p-1 text-sm">
          <button
            type="button"
            class="px-3 py-1.5 rounded-md transition"
            :class="view === '3d' ? 'bg-primary-500 text-white' : 'text-white/70 hover:text-white'"
            @click="view = '3d'"
          >
            <UIcon name="i-lucide-box" class="size-4 inline mr-1" /> 3D preview
          </button>
          <button
            type="button"
            class="px-3 py-1.5 rounded-md transition"
            :class="view === 'photo' ? 'bg-primary-500 text-white' : 'text-white/70 hover:text-white'"
            @click="view = 'photo'"
          >
            <UIcon name="i-lucide-image" class="size-4 inline mr-1" /> Photos
          </button>
        </div>

        <div class="rounded-xl overflow-hidden bg-secondary-900 aspect-[4/3] flex items-center justify-center">
          <ClientOnly v-if="view === '3d' && product.modelUrl">
            <ShipPreview
              :model-url="product.modelUrl"
              :placements="product.placements"
              :color="selectedVariant.swatch"
              :alt="`${product.title} 3D preview, ${selectedVariant.title}`"
            />
            <template #fallback>
              <div class="text-white/50 text-sm">Loading 3D preview…</div>
            </template>
          </ClientOnly>
          <img v-else :src="activeImage" :alt="product.featuredImage.altText" class="w-full h-full object-contain">
        </div>

        <div v-if="view === 'photo' && product.images.length > 1" class="mt-3 grid grid-cols-4 gap-2">
          <button
            v-for="img in product.images"
            :key="img.url"
            type="button"
            class="rounded-lg overflow-hidden bg-secondary-900 aspect-square border-2 transition flex items-center justify-center"
            :class="activeImage === img.url ? 'border-primary-400' : 'border-transparent hover:border-white/20'"
            @click="activeImage = img.url"
          >
            <img :src="img.url" :alt="img.altText" class="w-full h-full object-contain">
          </button>
        </div>

        <p v-if="view === '3d'" class="mt-3 text-xs text-white/50 italic">
          Live preview re-colored as you pick a filament. The printed ship is one solid color — rigging, sails, and flags are separate parts.
        </p>
      </div>

      <!-- Buy box -->
      <div class="flex flex-col gap-5">
        <div>
          <p class="text-xs uppercase tracking-[0.2em] text-primary-300 font-semibold">{{ product.faction }}</p>
          <h1 class="font-display text-3xl md:text-4xl text-white mt-1">{{ product.title }}</h1>
          <p class="mt-3 text-white/80">{{ product.tagline }}</p>
        </div>

        <!-- Printed box vs. STL files. Shown whenever both exist; a faction
             with only one way to buy does not need a choice put to it. -->
        <div v-if="hasPhysical && hasDigital" class="inline-flex rounded-lg border border-white/15 bg-secondary-900/60 p-1 text-sm self-start">
          <button
            type="button"
            class="px-4 py-2 rounded-md transition"
            :class="format === 'physical' ? 'bg-primary-500 text-white' : 'text-white/70 hover:text-white'"
            @click="format = 'physical'"
          >
            <UIcon name="i-lucide-package" class="size-4 inline mr-1" /> Printed set
          </button>
          <button
            type="button"
            class="px-4 py-2 rounded-md transition"
            :class="format === 'digital' ? 'bg-primary-500 text-white' : 'text-white/70 hover:text-white'"
            @click="format = 'digital'"
          >
            <UIcon name="i-lucide-download" class="size-4 inline mr-1" /> STL files
          </button>
        </div>

        <div v-if="justPurchased" class="rounded-xl border border-success-400/30 bg-success-500/15 p-4 text-sm text-white">
          <p class="font-semibold">Payment received — thank you.</p>
          <p class="text-white/80 mt-1">
            Your download link is on its way to the email you paid with. If it has not arrived in a
            few minutes, request another one below.
          </p>
        </div>

        <template v-if="format === 'physical' && selectedVariant">
        <div class="flex items-baseline gap-3">
          <p class="font-display text-2xl text-white">${{ totalPrice }}</p>
          <p v-if="quantity > 1" class="text-sm text-white/60">
            (${{ unitPrice.toFixed(2) }} × {{ quantity }})
          </p>
        </div>

        <div>
          <p class="text-sm text-white/70 mb-2">
            Color: <span class="text-white font-semibold">{{ selectedVariant?.title }}</span>
            <span v-if="!selectedVariant?.availableForSale" class="ml-2 text-error-300">— sold out</span>
          </p>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="v in product.variants"
              :key="v.id"
              type="button"
              class="size-10 rounded-full border-2 transition relative"
              :class="[
                selectedVariant?.id === v.id ? 'border-primary-400 ring-2 ring-primary-400/40' : 'border-white/30 hover:border-white/60',
                !v.availableForSale && 'opacity-40'
              ]"
              :style="{ background: v.swatch }"
              :title="`${v.title}${v.availableForSale ? '' : ' — sold out'}`"
              :aria-label="v.title"
              @click="selectedVariant = v"
            >
              <span v-if="!v.availableForSale" class="absolute inset-0 flex items-center justify-center text-white text-lg">×</span>
            </button>
          </div>
        </div>

        <div class="flex items-center gap-3">
          <label for="qty" class="text-sm text-white/70">Quantity</label>
          <div class="inline-flex items-center rounded-lg border border-white/15 bg-secondary-900/60">
            <button type="button" class="px-3 py-2 text-white/70 hover:text-white" @click="quantity = Math.max(1, quantity - 1)">−</button>
            <input id="qty" v-model.number="quantity" type="number" min="1" class="w-12 text-center bg-transparent text-white py-2 focus:outline-none">
            <button type="button" class="px-3 py-2 text-white/70 hover:text-white" @click="quantity = quantity + 1">+</button>
          </div>
        </div>

        <div class="flex flex-wrap gap-3">
          <UButton
            color="primary"
            size="xl"
            icon="i-lucide-shopping-cart"
            :loading="adding"
            :disabled="!selectedVariant?.availableForSale"
            @click="addNow"
          >
            {{ justAdded ? 'Added!' : `Add to cart — $${totalPrice}` }}
          </UButton>
          <UButton
            color="neutral"
            variant="outline"
            size="xl"
            icon="i-lucide-anchor"
            :disabled="!selectedVariant?.availableForSale"
            @click="buyNow"
          >
            Buy it now
          </UButton>
        </div>

        <p class="text-xs text-white/50">
          Printed and packed by hand. Currently shipping within the US only.
          Each set is made to order — please allow ~2 weeks before shipping.
        </p>
        </template>

        <!-- No printed box for this faction yet. Say so rather than showing
             an empty color picker. -->
        <template v-else-if="format === 'physical'">
          <div class="rounded-xl border border-white/10 bg-secondary-900/40 p-5">
            <p class="font-display text-lg text-white">No printed set yet</p>
            <p class="mt-2 text-sm text-white/70">
              We print the base-game factions by hand to order. This one is
              download-only for now — switch to <button type="button" class="text-primary-300 hover:underline" @click="format = 'digital'">STL files</button>
              to print it yourself.
            </p>
          </div>
        </template>

        <!-- Digital: the STL pack behind this faction. -->
        <template v-else-if="digital">
          <!-- Free with the base game. -->
          <div v-if="!digital.paid">
            <p class="font-display text-2xl text-white">Free</p>
            <p class="mt-2 text-sm text-white/70">
              This faction is part of the free base set — every model, at no cost, forever.
            </p>
            <UButton
              v-if="digital.freeDownloadUrl"
              :to="digital.freeDownloadUrl"
              class="mt-4"
              size="xl"
              color="primary"
              icon="i-lucide-download"
            >
              Download the STLs
            </UButton>
          </div>

          <!-- Released and priced. -->
          <div v-else-if="digital.purchasable">
            <p class="font-display text-2xl text-white">{{ formatPrice(digital.priceUsd) }}</p>
            <p class="mt-2 text-sm text-white/70">
              One-time purchase. Print as many as you like, and re-download free whenever
              the models are revised.
            </p>
            <UButton
              class="mt-4"
              size="xl"
              color="primary"
              icon="i-lucide-download"
              :loading="buyingFiles"
              @click="buyFiles"
            >
              Buy the files
            </UButton>
            <p v-if="filesError" class="mt-2 text-sm text-error-400">{{ filesError }}</p>

            <div class="mt-6 pt-5 border-t border-white/10">
              <p class="text-sm text-white/70">Already bought this?</p>
              <form class="mt-2 flex flex-col sm:flex-row gap-2" @submit.prevent="resend">
                <UInput v-model="email" type="email" required placeholder="you@example.com" class="flex-1" />
                <UButton type="submit" color="neutral" variant="outline" :loading="sending">Send link</UButton>
              </form>
              <p v-if="sendMessage" class="mt-2 text-xs text-white/60">{{ sendMessage }}</p>
            </div>
          </div>

          <!-- Not released. The server refuses checkout regardless of this. -->
          <div v-else class="rounded-xl border border-white/10 bg-secondary-900/40 p-5">
            <span class="text-[10px] uppercase tracking-widest font-semibold text-primary-300 bg-primary-500/15 px-2 py-1 rounded">
              Coming Soon
            </span>
            <p class="mt-3 text-sm text-white/70">
              This fleet is still being modeled and playtested. We release them one at a time —
              <NuxtLink to="/#signup" class="text-primary-300 hover:underline">the newsletter</NuxtLink>
              is where each one is announced.
            </p>
          </div>

          <UButton
            :to="digital.factionCard"
            target="_blank"
            icon="i-lucide-file-text"
            variant="outline"
            color="primary"
            size="sm"
            class="self-start"
          >
            Faction Card PDF
          </UButton>
        </template>
      </div>
    </div>

    <!-- Suggested products -->
    <section v-if="suggestions.length" class="mt-16">
      <h2 class="font-display text-2xl text-white">Better together</h2>
      <p class="mt-2 text-white/60 text-sm">Sets that pair well with this one.</p>
      <div class="mt-6 grid md:grid-cols-2 gap-5">
        <article
          v-for="s in suggestions"
          :key="s.product!.id"
          class="rounded-2xl border border-white/10 bg-secondary-900/60 overflow-hidden flex flex-col sm:flex-row"
        >
          <NuxtLink :to="`/shop/${s.product!.handle}`" class="sm:w-44 shrink-0 block bg-secondary-900">
            <img :src="s.product!.featuredImage.url" :alt="s.product!.featuredImage.altText" class="w-full h-full object-cover aspect-[4/3] sm:aspect-auto">
          </NuxtLink>
          <div class="p-5 flex flex-col gap-3 flex-1">
            <p class="text-xs uppercase tracking-[0.2em] text-primary-300 font-semibold">{{ s.pairing.title }}</p>
            <h3 class="font-display text-xl text-white">
              <NuxtLink :to="`/shop/${s.product!.handle}`" class="hover:text-primary-300">{{ s.product!.title }}</NuxtLink>
            </h3>
            <p class="text-sm text-white/75">{{ s.pairing.blurb }}</p>
            <div class="mt-auto pt-2 flex items-center justify-between">
              <p class="font-display text-white">${{ s.product!.priceRange.minVariantPrice.amount }}</p>
              <UButton :to="`/shop/${s.product!.handle}`" color="primary" variant="soft" size="sm" icon="i-lucide-arrow-right" trailing>
                View set
              </UButton>
            </div>
          </div>
        </article>
      </div>
    </section>

    <!-- What's in the box -->
    <section class="mt-16">
      <h2 class="font-display text-2xl text-white">What's in the box</h2>
      <div class="mt-6 grid md:grid-cols-3 gap-5">
        <div v-for="inc in product.includes" :key="inc.title" class="rounded-2xl border border-white/10 bg-secondary-900/60 p-6">
          <h3 class="font-display text-lg text-white flex items-center gap-2">
            <UIcon :name="inc.icon" class="size-5 text-primary-300" /> {{ inc.title }}
          </h3>
          <ul class="mt-3 space-y-2 text-sm text-white/80">
            <li v-for="(it, i) in inc.items" :key="i" class="flex gap-2">
              <span class="text-primary-300">•</span><span>{{ it }}</span>
            </li>
          </ul>
        </div>
      </div>
    </section>

    <!-- About -->
    <section class="mt-12 max-w-3xl text-white/80">
      <h2 class="font-display text-2xl text-white mb-3">About this set</h2>
      <p>{{ product.description }}</p>
    </section>
  </div>
</template>
