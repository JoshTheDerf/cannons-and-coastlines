<script setup lang="ts">
// Two carts share the drawer: the STL files (useFilesCart, Stripe) and the
// printed kits (useShop, a Shopify stub while KITS_ON_SALE is off).
const { cart, loadCart, updateQuantity, removeLine } = useShop()
const files = useFilesCart()
const open = files.open
const kitLines = computed(() => cart.value?.lines.length ?? 0)
const count = computed(() => files.ids.value.length + (cart.value?.totalQuantity ?? 0))

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
      <div v-if="open" class="fixed inset-0 z-[60] bg-black/70" @click="close" />
    </Transition>

    <Transition
      enter-active-class="transition-transform duration-300"
      leave-active-class="transition-transform duration-300"
      enter-from-class="translate-x-full" leave-to-class="translate-x-full"
    >
      <aside
        v-if="open"
        class="fixed top-0 right-0 z-[61] h-full w-full max-w-md bg-[color:var(--paper)] border-l border-ink/25 shadow-2xl flex flex-col"
        role="dialog"
        aria-label="Shopping cart"
      >
        <header class="flex items-center justify-between px-5 py-4 border-b border-ink/25">
          <h2 class="font-display text-xl text-ink flex items-center gap-2">
            <UIcon name="i-lucide-shopping-cart" class="size-5" />
            Your cart
            <span v-if="count > 0" class="text-sm text-ink-soft">({{ count }})</span>
          </h2>
          <button class="text-ink-soft hover:text-ink" aria-label="Close cart" @click="close">
            <UIcon name="i-lucide-x" class="size-6" />
          </button>
        </header>

        <div v-if="count === 0" class="flex-1 flex flex-col items-center justify-center p-8 text-center gap-4">
          <UIcon name="i-lucide-shopping-cart" class="size-12 text-ink-faint" />
          <p class="text-ink-soft">Your cart is empty.</p>
          <UButton to="/shop" color="primary" icon="i-lucide-arrow-right" trailing @click="close">Browse the shop</UButton>
        </div>

        <div v-else class="flex-1 overflow-y-auto">
          <section v-if="files.ids.value.length" class="p-5 border-b border-ink/20">
            <h3 class="font-display text-lg text-ink">STL files</h3>
            <FilesCartList compact @navigate="close" />
          </section>
          <h3 v-if="kitLines" class="px-5 pt-4 font-display text-lg text-ink">Printed kits</h3>
          <ul v-if="kitLines" class="divide-y divide-ink/20">
            <li v-for="line in cart.lines" :key="line.id" class="p-4 flex gap-3">
              <NuxtLink :to="`/shop/${line.product.handle}`" class="shrink-0" @click="close">
                <img :src="line.product.image.url" :alt="line.product.image.altText" class="size-20 rounded-lg object-cover">
              </NuxtLink>
              <div class="flex-1 min-w-0">
                <NuxtLink
                  :to="`/shop/${line.product.handle}`"
                  class="font-display text-sm text-ink hover:text-[color:var(--heading)] line-clamp-2"
                  @click="close"
                >
                  {{ line.product.title }}
                </NuxtLink>
                <p class="text-sm text-ink-soft flex items-center gap-1.5 mt-1">
                  <span class="size-2.5 rounded-full inline-block border border-ink/25" :style="{ background: line.variant.swatch }" />
                  {{ line.variant.title }}
                </p>
                <div class="mt-2 flex items-center justify-between gap-2">
                  <div class="inline-flex items-center rounded-md border border-ink/25 bg-paper-edge">
                    <button class="px-2 py-0.5 text-ink-soft hover:text-ink text-sm" :disabled="updating === line.id" @click="setQty(line.id, line.quantity - 1)">−</button>
                    <span class="w-7 text-center text-ink text-sm">{{ line.quantity }}</span>
                    <button class="px-2 py-0.5 text-ink-soft hover:text-ink text-sm" :disabled="updating === line.id" @click="setQty(line.id, line.quantity + 1)">+</button>
                  </div>
                  <p class="font-display text-sm text-ink">${{ line.lineTotal.amount }}</p>
                </div>
                <button class="mt-1 text-sm text-ink-faint hover:text-error-700 underline" @click="removeLine(line.id)">Remove</button>
              </div>
            </li>
          </ul>
        </div>

        <footer v-if="kitLines" class="border-t border-ink/25 p-5 space-y-3">
          <div class="flex justify-between text-sm">
            <span class="text-ink-soft">Subtotal</span>
            <span class="text-ink font-display">${{ cart.subtotal.amount }}</span>
          </div>
          <p class="text-sm text-ink-faint">Shipping and tax calculated at checkout.</p>
          <UButton color="primary" size="xl" icon="i-lucide-anchor" class="w-full justify-center" @click="checkout">
            Check out the kits
          </UButton>
        </footer>
        <div v-if="count > 0" class="px-5 pb-4">
          <UButton to="/shop/cart" color="neutral" variant="ghost" size="sm" class="w-full justify-center" @click="close">
            View full cart
          </UButton>
        </div>
      </aside>
    </Transition>
  </Teleport>
</template>
