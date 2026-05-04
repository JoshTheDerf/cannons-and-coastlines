<script setup lang="ts">
const { listProducts, cart, loadCart } = useShop()
const { data: products } = await useAsyncData('shop-products', () => listProducts())

onMounted(() => { if (!cart.value) loadCart() })

useSeoMeta({
  title: 'Shop',
  description: 'Order a Cannons & Coastlines starter set. Printed and packed by hand in Georgia.'
})
</script>

<template>
  <div>
    <header class="py-16 px-4 text-center text-white" style="background: linear-gradient(135deg, rgba(28,50,70,0.85), rgba(20,40,58,0.9)), url('/assets/photos/starter-pack/both-ships-and-background-sm.jpg') center/cover no-repeat;">
      <div class="container mx-auto max-w-3xl">
        <p class="font-display uppercase tracking-[0.25em] text-primary-300 text-sm mb-3">Shop</p>
        <h1 class="font-display text-4xl md:text-5xl">Starter sets</h1>
        <p class="mt-4 text-white/80">
          One faction per box. Most groups grab two so they can play head-to-head.
          Each set is printed in your choice of color, then packed by hand at our home in Georgia.
        </p>
      </div>
    </header>

    <section class="py-16 px-4 container mx-auto">
      <div class="grid md:grid-cols-2 gap-8">
        <article v-for="p in products" :key="p.id" class="rounded-2xl overflow-hidden border border-white/10 bg-secondary-900/60 flex flex-col">
          <NuxtLink :to="`/shop/${p.handle}`" class="block">
            <img :src="p.featuredImage.url" :alt="p.featuredImage.altText" class="w-full aspect-[4/3] object-cover">
          </NuxtLink>
          <div class="p-6 flex flex-col gap-3 flex-1">
            <p class="text-xs uppercase tracking-[0.2em] text-primary-300 font-semibold">{{ p.faction }}</p>
            <h2 class="font-display text-2xl text-white">
              <NuxtLink :to="`/shop/${p.handle}`" class="hover:text-primary-300">{{ p.title }}</NuxtLink>
            </h2>
            <p class="text-white/70 text-sm">{{ p.tagline }}</p>
            <div class="flex items-center gap-2 mt-1" aria-label="Available colors">
              <span
                v-for="v in p.variants"
                :key="v.id"
                class="size-5 rounded-full border border-white/20"
                :class="!v.availableForSale && 'opacity-30'"
                :style="{ background: v.swatch }"
                :title="`${v.title}${v.availableForSale ? '' : ' — sold out'}`"
              />
            </div>
            <div class="mt-auto pt-4 flex items-center justify-between">
              <p class="font-display text-xl text-white">
                ${{ p.priceRange.minVariantPrice.amount }}
              </p>
              <UButton :to="`/shop/${p.handle}`" color="primary" icon="i-lucide-arrow-right" trailing>
                View set
              </UButton>
            </div>
          </div>
        </article>
      </div>

      <p class="mt-10 text-center text-sm text-white/60">
        Have a question first?
        <a href="https://discord.gg/DMuFEWJtZq" target="_blank" rel="noopener" class="underline text-primary-300">Ask on Discord</a>
        or join the <NuxtLink to="/#signup" class="underline text-primary-300">mailing list</NuxtLink>.
      </p>
    </section>
  </div>
</template>
