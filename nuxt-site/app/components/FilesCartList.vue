<script setup lang="ts">
// The STL files in the cart, their prices and the checkout button. Used by
// the cart drawer and /shop/cart. Prices here are for display: /api/checkout
// prices each set from server/data/sets.json.
defineProps<{ compact?: boolean }>()
const emit = defineEmits<{ navigate: [] }>()

const route = useRoute()
const { data: setsData } = useFleetSets()
const cart = useFilesCart()

const buyable = computed(() => (setsData.value?.all ?? []).filter(s => s.purchasable))
// Anything no longer on sale (or never was) is shown so it can be removed,
// but it stays out of the checkout.
const items = computed(() => cart.ids.value.map(id => ({
  id,
  set: buyable.value.find(s => s.id === id) ?? null,
  fleet: findAddonFleet(id)
})))
const valid = computed(() => items.value.filter(i => i.set))
const subtotal = computed(() => valid.value.reduce((n, i) => n + (i.set!.priceUsd ?? 0), 0))
const missing = computed(() => buyable.value.filter(s => !cart.has(s.id)))
const everyFleet = computed(() => buyable.value.length > 1 && missing.value.length === 0)

const busy = ref(false)
const error = ref('')
async function checkout() {
  busy.value = true
  error.value = ''
  try {
    await cart.checkout(valid.value.map(i => i.id), route.path)
  } catch (e) {
    error.value = checkoutError(e)
    busy.value = false
  }
}
</script>

<template>
  <div>
    <p v-if="!items.length" class="text-sm text-ink-soft">No STL files in your cart.</p>
    <template v-else>
      <ul class="divide-y divide-ink/15">
        <li v-for="i in items" :key="i.id" class="py-3 flex gap-3 items-center">
          <img v-if="i.set" :src="i.set.images.preview" :alt="i.set.title" class="size-14 rounded-md object-contain bg-[color:var(--paper-tint)] shrink-0">
          <div class="flex-1 min-w-0">
            <NuxtLink v-if="i.fleet" :to="`/shop/${i.fleet.handle}`" class="font-display text-ink hover:text-[color:var(--heading)]" @click="emit('navigate')">
              {{ i.set?.title ?? i.fleet.name }}
            </NuxtLink>
            <p v-else class="font-display text-ink">{{ i.id }}</p>
            <p class="text-xs text-ink-faint">
              <template v-if="!i.set">Not on sale right now, so it won't be in the checkout.</template>
              <template v-else-if="cart.owned.value.includes(i.id)">You've bought this on this device before.</template>
              <template v-else>STL files</template>
            </p>
          </div>
          <div class="text-right shrink-0">
            <p v-if="i.set" class="font-display text-ink">{{ formatPrice(i.set.priceUsd) }}</p>
            <button type="button" class="text-xs text-ink-faint hover:text-error-700 underline" @click="cart.remove(i.id)">Remove</button>
          </div>
        </li>
      </ul>

      <p v-if="everyFleet" class="mt-2 text-sm text-ink-soft">That's every add-on fleet, so your order page will also have them all in one zip.</p>
      <button
        v-else-if="missing.length && valid.length"
        type="button"
        class="mt-2 text-sm text-[color:var(--gold)] hover:underline"
        @click="cart.addMany(missing.map(s => s.id))"
      >
        Add the other {{ missing.length }} {{ missing.length === 1 ? 'fleet' : 'fleets' }}
      </button>

      <div class="mt-4 flex justify-between text-sm">
        <span class="text-ink-soft">Subtotal</span>
        <span class="font-display text-ink">{{ formatPrice(subtotal) }}</span>
      </div>
      <UButton
        color="primary"
        :size="compact ? 'lg' : 'xl'"
        icon="i-lucide-lock"
        block
        class="mt-3 justify-center"
        :disabled="!valid.length"
        :loading="busy"
        @click="checkout"
      >
        Check out · {{ formatPrice(subtotal) }}
      </UButton>
      <p v-if="error" class="mt-2 text-sm text-error-500">{{ error }}</p>
      <p class="mt-2 text-xs text-ink-faint">Payment is by Stripe. You download right after checkout, and the link is in your receipt too.</p>
    </template>
  </div>
</template>
