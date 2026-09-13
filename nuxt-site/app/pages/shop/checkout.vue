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
    <div class="card-parchment p-8 text-center">
      <UIcon name="i-lucide-anchor" class="size-10 text-[color:var(--gold)] mx-auto" />
      <h1 class="font-display text-2xl text-ink mt-4">Shopify checkout (stub)</h1>
      <p class="mt-3 text-ink-soft">
        On the live site, this redirects to Shopify's hosted checkout where the customer
        enters address, picks shipping, and pays.
      </p>
      <p class="mt-4 text-sm text-ink-faint break-all">Cart ID: {{ cartId || '—' }}</p>
      <NuxtLink to="/shop/cart" class="mt-6 inline-block text-sm text-[color:var(--gold)] hover:text-[color:var(--heading)] underline">← Back to cart</NuxtLink>
    </div>
  </div>
</template>
