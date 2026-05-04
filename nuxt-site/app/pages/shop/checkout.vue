<script setup lang="ts">
// Stub for the Shopify-hosted checkout. In production this URL lives on a
// Shopify subdomain (e.g. checkout.cannonsandcoastlines.com) and renders
// Shopify's own checkout — addresses, shipping rates, taxes, payment.
const route = useRoute()
const cartId = computed(() => String(route.query.cart ?? ''))
useSeoMeta({ title: 'Checkout' })
</script>

<template>
  <div class="py-16 px-4 container mx-auto max-w-2xl">
    <div class="rounded-2xl border border-white/10 bg-secondary-900/60 p-8 text-center">
      <UIcon name="i-lucide-anchor" class="size-10 text-primary-300 mx-auto" />
      <h1 class="font-display text-2xl text-white mt-4">Shopify checkout (stub)</h1>
      <p class="mt-3 text-white/70">
        On the live site, this redirects to Shopify's hosted checkout where the customer
        enters address, picks shipping, and pays.
      </p>
      <p class="mt-4 text-xs text-white/40 break-all">Cart ID: {{ cartId || '—' }}</p>
      <NuxtLink to="/shop/cart" class="mt-6 inline-block text-sm text-primary-300 hover:text-primary-200 underline">← Back to cart</NuxtLink>
    </div>
  </div>
</template>
