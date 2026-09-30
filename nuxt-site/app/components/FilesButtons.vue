<script setup lang="ts">
// Buttons for one add-on fleet's STL files. Renders nothing for a fleet
// that isn't on sale (the free base fleets, or a set still coming soon).
//
//   <FilesButtons fleet="Stone Fleet" />            Get digital files + shop page link
//   <FilesButtons fleet="stone-fleet" buy-now />    Add to cart + Buy now, side by side
//
// `fleet` is a name, shop handle or set id (see ADDON_FLEETS).
const props = withDefaults(defineProps<{
  fleet: string
  buyNow?: boolean
  shopLink?: boolean
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  block?: boolean
  ownedNote?: boolean
}>(), { buyNow: false, shopLink: true, size: 'sm', block: false, ownedNote: false })

const route = useRoute()
const { data: setsData } = await useFleetSets()
const cart = useFilesCart()

const f = computed(() => findAddonFleet(props.fleet))
const set = computed(() => setsData.value?.all.find(s => s.id === f.value?.setId && s.purchasable) ?? null)
const inCart = computed(() => !!set.value && cart.has(set.value.id))
const owned = computed(() => !!set.value && cart.owned.value.includes(set.value.id))

function addToCart() {
  if (!set.value) return
  cart.add(set.value.id)
  cart.open.value = true
}

const buying = ref(false)
const error = ref('')
async function buy() {
  if (!set.value) return
  buying.value = true
  error.value = ''
  try {
    await cart.checkout([set.value.id], route.path)
  } catch (e) {
    error.value = checkoutError(e)
    buying.value = false
  }
}
</script>

<template>
  <div v-if="set && f" :class="block ? 'grid gap-2' : 'flex flex-wrap items-center gap-x-3 gap-y-2'">
    <div :class="buyNow ? 'grid grid-cols-2 gap-2' : 'contents'">
      <UButton
        :color="buyNow ? 'neutral' : 'primary'"
        :variant="buyNow ? 'outline' : 'solid'"
        :size="size"
        :icon="inCart ? 'i-lucide-check' : 'i-lucide-shopping-cart'"
        :block="block || buyNow"
        class="justify-center"
        @click="inCart ? (cart.open.value = true) : addToCart()"
      >
        {{ inCart ? 'In cart' : buyNow ? 'Add to cart' : 'Get digital files' }}
      </UButton>
      <UButton v-if="buyNow" color="primary" :size="size" icon="i-lucide-download" block class="justify-center" :loading="buying" @click="buy">
        Buy now
      </UButton>
    </div>
    <NuxtLink v-if="shopLink" :to="`/shop/${f.handle}`" class="text-sm text-[color:var(--gold)] hover:underline whitespace-nowrap">
      {{ f.name }} in the shop →
    </NuxtLink>
    <p v-if="owned && ownedNote" class="text-xs text-ink-faint basis-full">You've bought this on this device before. The download link is in your receipt email.</p>
    <p v-if="error" class="text-sm text-error-500 basis-full">{{ error }}</p>
  </div>
</template>
