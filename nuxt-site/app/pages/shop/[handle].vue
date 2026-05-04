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

const initialVariant = product.value.variants.find(v => v.availableForSale) ?? product.value.variants[0]!
const selectedVariant = ref<ShopVariant>(initialVariant)
const quantity = ref(1)
const activeImage = ref(product.value.images[0]?.url ?? product.value.featuredImage.url)
const view = ref<'photo' | '3d'>('photo')
const adding = ref(false)
const justAdded = ref(false)

const unitPrice = computed(() => Number(selectedVariant.value.price.amount))
const totalPrice = computed(() => (unitPrice.value * quantity.value).toFixed(2))

onMounted(() => { if (!cart.value) loadCart() })

async function addNow() {
  if (!selectedVariant.value.availableForSale) return
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
  if (!selectedVariant.value.availableForSale) return
  await addToCart(selectedVariant.value.id, quantity.value)
  await navigateTo('/shop/cart')
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

        <div class="flex items-baseline gap-3">
          <p class="font-display text-2xl text-white">${{ totalPrice }}</p>
          <p v-if="quantity > 1" class="text-sm text-white/60">
            (${{ unitPrice.toFixed(2) }} × {{ quantity }})
          </p>
        </div>

        <div>
          <p class="text-sm text-white/70 mb-2">
            Color: <span class="text-white font-semibold">{{ selectedVariant.title }}</span>
            <span v-if="!selectedVariant.availableForSale" class="ml-2 text-error-300">— sold out</span>
          </p>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="v in product.variants"
              :key="v.id"
              type="button"
              class="size-10 rounded-full border-2 transition relative"
              :class="[
                selectedVariant.id === v.id ? 'border-primary-400 ring-2 ring-primary-400/40' : 'border-white/30 hover:border-white/60',
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
            :disabled="!selectedVariant.availableForSale"
            @click="addNow"
          >
            {{ justAdded ? 'Added!' : `Add to cart — $${totalPrice}` }}
          </UButton>
          <UButton
            color="neutral"
            variant="outline"
            size="xl"
            icon="i-lucide-anchor"
            :disabled="!selectedVariant.availableForSale"
            @click="buyNow"
          >
            Buy it now
          </UButton>
        </div>

        <p class="text-xs text-white/50">
          Printed and packed by hand. Currently shipping within the US only.
          Each set is made to order — please allow ~2 weeks before shipping.
        </p>
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
