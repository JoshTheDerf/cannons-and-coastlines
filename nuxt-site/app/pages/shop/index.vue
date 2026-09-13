<script setup lang="ts">
const { listProducts, cart, loadCart } = useShop()
const { data: products } = await useAsyncData('shop-products', () => listProducts())

onMounted(() => { if (!cart.value) loadCart() })

useSeoMeta({
  title: 'Shop',
  description: 'Boxed Cannons & Coastlines starter sets, printed and packed by hand in Georgia.'
})
</script>

<template>
  <div>
    <header class="py-16 px-4 text-center text-ink" style="background: linear-gradient(135deg, rgba(28,50,70,0.85), rgba(20,40,58,0.9)), url('/assets/photos/starter-pack/both-ships-and-background-sm.jpg') center/cover no-repeat;">
      <div class="container mx-auto max-w-3xl">
        <p class="font-display uppercase tracking-[0.25em] text-[color:var(--gold)] text-sm mb-3">Shop</p>
        <h1 class="font-display text-4xl md:text-5xl">Starter sets</h1>
        <p class="mt-4 text-ink-soft">
          One fleet per box. Grab two and you have a game. Printed in your color and
          packed by hand at our home in Georgia.
        </p>
      </div>
    </header>

    <section class="py-16 px-4 container mx-auto">
      <div class="grid md:grid-cols-2 gap-8">
        <article v-for="p in products" :key="p.id" class="card-parchment overflow-hidden flex flex-col">
          <NuxtLink :to="`/shop/${p.handle}`" class="block">
            <img :src="p.featuredImage.url" :alt="p.featuredImage.altText" class="w-full aspect-[4/3] object-cover">
          </NuxtLink>
          <div class="p-6 flex flex-col gap-3 flex-1">
            <p class="text-sm uppercase tracking-[0.2em] text-[color:var(--gold)] font-semibold">{{ p.faction }}</p>
            <h2 class="font-display text-2xl text-ink">
              <NuxtLink :to="`/shop/${p.handle}`" class="hover:text-[color:var(--heading)]">{{ p.title }}</NuxtLink>
            </h2>
            <p class="text-ink-soft text-sm">{{ p.tagline }}</p>
            <div v-if="p.variants.length" class="flex items-center gap-2 mt-1" aria-label="Available colors">
              <span
                v-for="v in p.variants"
                :key="v.id"
                class="size-5 rounded-full border border-ink/25"
                :class="!v.availableForSale && 'opacity-30'"
                :style="{ background: v.swatch }"
                :title="`${v.title}${v.availableForSale ? '' : ' — sold out'}`"
              />
            </div>
            <div class="mt-auto pt-4 flex items-center justify-between">
              <p class="font-display text-xl text-ink">
                <template v-if="p.variants.length">${{ p.priceRange.minVariantPrice.amount }}</template>
                <template v-else>Files only</template>
              </p>
              <UButton :to="`/shop/${p.handle}`" color="primary" icon="i-lucide-arrow-right" trailing>
                View set
              </UButton>
            </div>
          </div>
        </article>
      </div>

      <p class="mt-10 text-center text-sm text-ink-soft">
        Have a question first?
        <a href="https://discord.gg/DMuFEWJtZq" target="_blank" rel="noopener" class="underline text-[color:var(--gold)]">Ask on Discord</a>
        or join the <NuxtLink to="/#signup" class="underline text-[color:var(--gold)]">mailing list</NuxtLink>.
      </p>
    </section>
  </div>
</template>
