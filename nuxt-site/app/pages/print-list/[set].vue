<script setup lang="ts">
// /print-list/<set-id or bundle-id>: what to print from one paid set or the
// all-fleets bundle, and the button that downloads it. The order page's
// download links land here. The free base set's list is /print-guide, and
// /print-list/base-set redirects there (nuxt.config.ts routeRules, and the
// check below for a client-side visit).
//
// The settings, colors and assembly are on /print-guide, so this page has
// the tables and plates (usePrintList, PrintListBody) and links there.
import { BASE_SET_ID, usePrintList } from '~/composables/usePrintList'

const route = useRoute()
const id = String(route.params.set)
if (id === BASE_SET_ID) {
  await navigateTo({ path: '/print-guide', query: route.query, hash: route.hash || undefined }, { redirectCode: 301, replace: true })
}

const pl = await usePrintList(id)
const { L, bundle, title, orderKey, share, free, downloadUrl, shopHandle, pdfUrl, versions } = pl

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
          <FilesButtons v-else-if="shopHandle" :fleet="shopHandle" buy-now size="lg" class="w-full max-w-md" />
          <UButton v-else to="/shop" color="primary" size="xl" icon="i-lucide-shopping-cart">
            The shop
          </UButton>
        </div>
        <p class="mt-4 flex flex-wrap justify-center gap-x-5 gap-y-1 text-sm">
          <a :href="pdfUrl" target="_blank" class="underline text-[color:var(--gold)]">This list as a PDF</a>
          <NuxtLink v-if="orderKey" :to="`/shop/order/${orderKey}`" class="underline text-[color:var(--gold)]">Back to your order</NuxtLink>
          <NuxtLink v-else-if="shopHandle && !free" :to="`/shop/${shopHandle}`" class="underline text-[color:var(--gold)]">The shop page</NuxtLink>
        </p>

        <HowToSteps :title="L.howTo.title" :steps="pl.howTo" class="mt-8" />
      </div>
    </header>

    <PrintListBody :pl="pl" />

    <BackHome />
  </div>
</template>
