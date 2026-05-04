<script setup lang="ts">
defineProps<{
  data: {
    brand: { name: string, logo: string }
    nav: Array<{ label: string, to: string, external?: boolean }>
    cta: { label: string, to: string, icon: string }
  }
}>()

const open = ref(false)
const { cart } = useShop()
const cartDrawerOpen = useState<boolean>('cart-drawer-open', () => false)
const openCart = () => { cartDrawerOpen.value = true }
</script>

<template>
  <nav class="sticky top-0 z-40 bg-secondary-900/95 backdrop-blur border-b border-white/10">
    <div class="container mx-auto flex items-center justify-between gap-4 px-4 py-3">
      <NuxtLink to="/" class="flex items-center">
        <img :src="data.brand.logo" :alt="data.brand.name" class="h-10 w-auto">
      </NuxtLink>
      <ul class="hidden lg:flex items-center gap-6 text-sm font-medium">
        <li v-for="link in data.nav" :key="link.to">
          <a v-if="link.external" :href="link.to" class="text-white/80 hover:text-white transition">{{ link.label }}</a>
          <NuxtLink v-else :to="link.to" class="text-white/80 hover:text-white transition">
            {{ link.label }}
          </NuxtLink>
        </li>
        <li>
          <UButton :to="data.cta.to" color="primary" variant="solid" :icon="data.cta.icon" size="sm">
            {{ data.cta.label }}
          </UButton>
        </li>
      </ul>
      <div class="flex items-center gap-1">
        <!--
        <button
          type="button"
          class="relative size-10 rounded-lg text-white/80 hover:text-white hover:bg-white/5 flex items-center justify-center transition"
          aria-label="Open cart"
          @click="openCart"
        >
          <UIcon name="i-lucide-shopping-cart" class="size-5" />
          <span
            v-if="cart && cart.totalQuantity > 0"
            class="absolute -top-0.5 -right-0.5 min-w-5 h-5 px-1 rounded-full bg-primary-500 text-white text-[11px] font-semibold flex items-center justify-center"
          >{{ cart.totalQuantity }}</span>
        </button>
        -->
        <button
          type="button"
          class="lg:hidden size-10 rounded-lg text-white/80 hover:text-white hover:bg-white/5 flex items-center justify-center transition"
          aria-label="Toggle menu"
          @click="open = !open"
        >
          <UIcon :name="open ? 'i-lucide-x' : 'i-lucide-menu'" class="size-5" />
        </button>
      </div>
    </div>
    <div v-if="open" class="lg:hidden border-t border-white/10 bg-secondary-900">
      <ul class="container mx-auto flex flex-col gap-1 px-4 py-3">
        <li v-for="link in data.nav" :key="link.to">
          <a v-if="link.external" :href="link.to" class="block py-2 text-white/80 hover:text-white" @click="open = false">{{ link.label }}</a>
          <NuxtLink v-else :to="link.to" class="block py-2 text-white/80 hover:text-white" @click="open = false">
            {{ link.label }}
          </NuxtLink>
        </li>
        <li class="pt-2">
          <UButton :to="data.cta.to" color="primary" variant="solid" :icon="data.cta.icon" block>
            {{ data.cta.label }}
          </UButton>
        </li>
      </ul>
    </div>
  </nav>
</template>
