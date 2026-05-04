<script setup lang="ts">
const { cart, loadCart, updateQuantity, removeLine } = useShop()
const open = useState<boolean>('cart-drawer-open', () => false)

onMounted(() => { if (!cart.value) loadCart() })

watch(open, (isOpen) => {
  if (!import.meta.client) return
  document.body.style.overflow = isOpen ? 'hidden' : ''
})

function close() { open.value = false }

const updating = ref<string | null>(null)
async function setQty(lineId: string, qty: number) {
  updating.value = lineId
  try { await updateQuantity(lineId, Math.max(0, qty)) }
  finally { updating.value = null }
}

async function checkout() {
  if (!cart.value) return
  close()
  await navigateTo(cart.value.checkoutUrl, { external: true })
}
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-opacity duration-200"
      leave-active-class="transition-opacity duration-200"
      enter-from-class="opacity-0" leave-to-class="opacity-0"
    >
      <div v-if="open" class="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm" @click="close" />
    </Transition>

    <Transition
      enter-active-class="transition-transform duration-300"
      leave-active-class="transition-transform duration-300"
      enter-from-class="translate-x-full" leave-to-class="translate-x-full"
    >
      <aside
        v-if="open"
        class="fixed top-0 right-0 z-[61] h-full w-full max-w-md bg-secondary-900 border-l border-white/10 shadow-2xl flex flex-col"
        role="dialog"
        aria-label="Shopping cart"
      >
        <header class="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <h2 class="font-display text-xl text-white flex items-center gap-2">
            <UIcon name="i-lucide-shopping-cart" class="size-5" />
            Your cart
            <span v-if="cart && cart.totalQuantity > 0" class="text-sm text-white/60">({{ cart.totalQuantity }})</span>
          </h2>
          <button class="text-white/60 hover:text-white" aria-label="Close cart" @click="close">
            <UIcon name="i-lucide-x" class="size-6" />
          </button>
        </header>

        <div v-if="!cart || cart.lines.length === 0" class="flex-1 flex flex-col items-center justify-center p-8 text-center gap-4">
          <UIcon name="i-lucide-shopping-cart" class="size-12 text-white/30" />
          <p class="text-white/70">Your cart is empty.</p>
          <UButton to="/shop" color="primary" icon="i-lucide-arrow-right" trailing @click="close">Browse starter sets</UButton>
        </div>

        <div v-else class="flex-1 overflow-y-auto">
          <ul class="divide-y divide-white/10">
            <li v-for="line in cart.lines" :key="line.id" class="p-4 flex gap-3">
              <NuxtLink :to="`/shop/${line.product.handle}`" class="shrink-0" @click="close">
                <img :src="line.product.image.url" :alt="line.product.image.altText" class="size-20 rounded-lg object-cover">
              </NuxtLink>
              <div class="flex-1 min-w-0">
                <NuxtLink
                  :to="`/shop/${line.product.handle}`"
                  class="font-display text-sm text-white hover:text-primary-300 line-clamp-2"
                  @click="close"
                >
                  {{ line.product.title }}
                </NuxtLink>
                <p class="text-xs text-white/60 flex items-center gap-1.5 mt-1">
                  <span class="size-2.5 rounded-full inline-block border border-white/20" :style="{ background: line.variant.swatch }" />
                  {{ line.variant.title }}
                </p>
                <div class="mt-2 flex items-center justify-between gap-2">
                  <div class="inline-flex items-center rounded-md border border-white/15 bg-secondary-900">
                    <button class="px-2 py-0.5 text-white/70 hover:text-white text-sm" :disabled="updating === line.id" @click="setQty(line.id, line.quantity - 1)">−</button>
                    <span class="w-7 text-center text-white text-xs">{{ line.quantity }}</span>
                    <button class="px-2 py-0.5 text-white/70 hover:text-white text-sm" :disabled="updating === line.id" @click="setQty(line.id, line.quantity + 1)">+</button>
                  </div>
                  <p class="font-display text-sm text-white">${{ line.lineTotal.amount }}</p>
                </div>
                <button class="mt-1 text-[11px] text-white/40 hover:text-error-300 underline" @click="removeLine(line.id)">Remove</button>
              </div>
            </li>
          </ul>
        </div>

        <footer v-if="cart && cart.lines.length > 0" class="border-t border-white/10 p-5 space-y-3">
          <div class="flex justify-between text-sm">
            <span class="text-white/70">Subtotal</span>
            <span class="text-white font-display">${{ cart.subtotal.amount }}</span>
          </div>
          <p class="text-xs text-white/50">Shipping and tax calculated at checkout.</p>
          <UButton color="primary" size="xl" icon="i-lucide-anchor" class="w-full justify-center" @click="checkout">
            Checkout
          </UButton>
          <UButton to="/shop/cart" color="neutral" variant="ghost" size="sm" class="w-full justify-center" @click="close">
            View full cart
          </UButton>
        </footer>
      </aside>
    </Transition>
  </Teleport>
</template>
