<script setup lang="ts">
const { cart, loadCart, updateQuantity, removeLine } = useShop()

onMounted(() => { if (!cart.value) loadCart() })

useSeoMeta({ title: 'Cart' })

const updating = ref<string | null>(null)
async function setQty(lineId: string, qty: number) {
  updating.value = lineId
  try { await updateQuantity(lineId, Math.max(0, qty)) }
  finally { updating.value = null }
}

function checkout() {
  if (!cart.value) return
  // On real Shopify this is an external URL on the shop's domain.
  navigateTo(cart.value.checkoutUrl, { external: true })
}
</script>

<template>
  <div class="py-12 px-4 container mx-auto max-w-4xl">
    <NuxtLink to="/shop" class="text-sm text-white/60 hover:text-white">← Continue shopping</NuxtLink>
    <h1 class="font-display text-3xl text-white mt-4">Your cart</h1>

    <div v-if="!cart || cart.lines.length === 0" class="mt-10 rounded-2xl border border-white/10 bg-secondary-900/60 p-10 text-center">
      <UIcon name="i-lucide-shopping-cart" class="size-10 text-white/40 mx-auto" />
      <p class="mt-3 text-white/70">Your cart is empty.</p>
      <UButton to="/shop" color="primary" class="mt-5" icon="i-lucide-arrow-right" trailing>Browse starter sets</UButton>
    </div>

    <div v-else class="mt-8 grid lg:grid-cols-[1.4fr_1fr] gap-8">
      <ul class="flex flex-col gap-3">
        <li v-for="line in cart.lines" :key="line.id" class="rounded-xl border border-white/10 bg-secondary-900/60 p-4 flex gap-4 items-center">
          <NuxtLink :to="`/shop/${line.product.handle}`" class="shrink-0">
            <img :src="line.product.image.url" :alt="line.product.image.altText" class="size-24 rounded-lg object-cover">
          </NuxtLink>
          <div class="flex-1 min-w-0">
            <NuxtLink :to="`/shop/${line.product.handle}`" class="font-display text-lg text-white hover:text-primary-300">{{ line.product.title }}</NuxtLink>
            <p class="text-sm text-white/70 flex items-center gap-2 mt-1">
              <span class="size-3 rounded-full inline-block border border-white/20" :style="{ background: line.variant.swatch }" />
              {{ line.variant.title }}
            </p>
            <div class="mt-3 inline-flex items-center rounded-lg border border-white/15 bg-secondary-900">
              <button class="px-2.5 py-1.5 text-white/70 hover:text-white" :disabled="updating === line.id" @click="setQty(line.id, line.quantity - 1)">−</button>
              <span class="w-8 text-center text-white text-sm">{{ line.quantity }}</span>
              <button class="px-2.5 py-1.5 text-white/70 hover:text-white" :disabled="updating === line.id" @click="setQty(line.id, line.quantity + 1)">+</button>
            </div>
          </div>
          <div class="text-right shrink-0">
            <p class="font-display text-white">${{ line.lineTotal.amount }}</p>
            <button class="mt-2 text-xs text-white/50 hover:text-error-300 underline" @click="removeLine(line.id)">Remove</button>
          </div>
        </li>
      </ul>

      <aside class="rounded-2xl border border-white/10 bg-secondary-900/60 p-6 h-fit">
        <h2 class="font-display text-xl text-white">Summary</h2>
        <dl class="mt-4 space-y-2 text-sm">
          <div class="flex justify-between text-white/70">
            <dt>Subtotal</dt>
            <dd class="text-white">${{ cart.subtotal.amount }}</dd>
          </div>
          <div class="flex justify-between text-white/70">
            <dt>Shipping</dt>
            <dd>Calculated at checkout</dd>
          </div>
          <div class="flex justify-between text-white/70">
            <dt>Tax</dt>
            <dd>Calculated at checkout</dd>
          </div>
        </dl>
        <UButton color="primary" size="xl" icon="i-lucide-anchor" class="mt-6 w-full justify-center" @click="checkout">
          Checkout — ${{ cart.subtotal.amount }}
        </UButton>
        <p class="mt-3 text-xs text-white/50">
          Checkout is hosted by Shopify on a secure subdomain. Payment, taxes, and shipping
          rates are handled there.
        </p>
      </aside>
    </div>
  </div>
</template>
