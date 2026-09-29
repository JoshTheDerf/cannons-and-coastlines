<script setup lang="ts">
// Where Stripe sends a buyer after checkout, and the link in their receipt
// email. The URL is the credential (see server/utils/entitlement.ts), so the
// page is fetched client-side only, never indexed, and sends no referrer.

type OrderSet = {
  id: string
  title: string
  version: string
  image: string
  factionCard: string
  handle: string | null
  downloadUrl: string | null
}
type OrderResponse = { state: 'paid' | 'pending' | 'expired' | 'refunded', email: string | null, sets: OrderSet[] }

const route = useRoute()
const key = String(route.params.key)

useSeoMeta({ title: 'Your downloads', robots: 'noindex, nofollow', referrer: 'no-referrer' })

const order = ref<OrderResponse | null>(null)
const notFound = ref(false)
const failed = ref(false)

let timer: ReturnType<typeof setTimeout> | undefined
let tries = 0

async function load() {
  try {
    order.value = await $fetch<OrderResponse>(`/api/order/${key}`)
    failed.value = false
  } catch (e: any) {
    if (e?.statusCode === 404 || e?.response?.status === 404) notFound.value = true
    else failed.value = true
  }
  // A card payment usually settles before Stripe redirects here, but give a
  // slow one a minute before asking the buyer to come back later.
  if (order.value?.state === 'pending' && tries++ < 30) timer = setTimeout(load, 2000)
}

onMounted(load)
onBeforeUnmount(() => clearTimeout(timer))

const copied = ref(false)
async function copyLink() {
  await navigator.clipboard.writeText(window.location.href)
  copied.value = true
  setTimeout(() => { copied.value = false }, 2000)
}
</script>

<template>
  <div class="py-12 px-4 container mx-auto max-w-3xl">
    <NuxtLink to="/shop" class="text-sm text-ink-soft hover:text-ink">← Back to the shop</NuxtLink>

    <div v-if="notFound" class="mt-6 card-parchment p-8 text-center">
      <UIcon name="i-lucide-search-x" class="size-10 text-ink-faint mx-auto" />
      <h1 class="font-display text-2xl text-ink mt-4">We couldn't find that order</h1>
      <p class="mt-3 text-ink-soft">
        Check that the link matches the one in your receipt email. If it still doesn't work, email
        <a href="mailto:josh@thederf.com" class="underline text-[color:var(--gold)]">josh@thederf.com</a>
        with the address you paid with.
      </p>
    </div>

    <div v-else-if="!order" class="mt-6 card-parchment p-8 text-center">
      <template v-if="failed">
        <p class="text-ink-soft">Something went wrong loading your order.</p>
        <UButton class="mt-4" color="primary" icon="i-lucide-refresh-cw" @click="load">Try again</UButton>
      </template>
      <p v-else class="text-ink-soft flex items-center justify-center gap-2">
        <UIcon name="i-lucide-loader-circle" class="size-5 animate-spin" /> Loading your order…
      </p>
    </div>

    <template v-else>
      <header class="mt-6">
        <p class="font-display uppercase tracking-[0.25em] text-[color:var(--gold)] text-sm mb-2">Your order</p>
        <h1 class="font-display text-3xl md:text-4xl text-[color:var(--heading)]">
          {{ order.state === 'paid' ? 'Thanks! Your files are ready.'
            : order.state === 'pending' ? 'Confirming your payment…'
              : order.state === 'refunded' ? 'This order was refunded'
                : 'This checkout was not completed' }}
        </h1>
        <p v-if="order.state === 'paid'" class="mt-3 text-ink-soft">
          This page is your download link. It's also in the receipt Stripe sent to
          <b class="text-ink">{{ order.email }}</b>, so you can come back any time, including for
          updated versions when the models change.
        </p>
        <p v-else-if="order.state === 'pending'" class="mt-3 text-ink-soft flex items-center gap-2">
          <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin" />
          Usually only a few seconds. This page updates on its own.
        </p>
        <p v-else-if="order.state === 'refunded'" class="mt-3 text-ink-soft">
          The downloads are no longer available. Questions? Email
          <a href="mailto:josh@thederf.com" class="underline text-[color:var(--gold)]">josh@thederf.com</a>.
        </p>
        <p v-else class="mt-3 text-ink-soft">
          No payment was taken. <NuxtLink to="/shop" class="underline text-[color:var(--gold)]">Head back to the shop</NuxtLink> to try again.
        </p>
      </header>

      <ul class="mt-8 flex flex-col gap-3">
        <li v-for="s in order.sets" :key="s.id" class="card-parchment p-4 flex gap-4 items-center">
          <img :src="s.image" :alt="`A ${s.title} ship`" class="size-20 sm:size-24 rounded-lg object-contain bg-[color:var(--paper-tint)] shrink-0">
          <div class="flex-1 min-w-0">
            <p class="font-display text-lg text-ink">{{ s.title }}</p>
            <p class="text-sm text-ink-soft">STL files · version {{ s.version }}</p>
            <a :href="s.factionCard" target="_blank" class="text-sm text-[color:var(--gold)] hover:underline">Faction card (PDF)</a>
          </div>
          <UButton v-if="s.downloadUrl" :to="s.downloadUrl" external color="primary" icon="i-lucide-download" size="lg" class="shrink-0">
            <span class="hidden sm:inline">Download</span>
          </UButton>
        </li>
      </ul>

      <div v-if="order.state === 'paid'" class="mt-8 grid gap-3 text-sm text-ink-soft">
        <UButton color="neutral" variant="outline" icon="i-lucide-link" class="justify-self-start" @click="copyLink">
          {{ copied ? 'Copied' : 'Copy this link' }}
        </UButton>
        <p>
          The files are for your own prints; please don't share the link. See the
          <NuxtLink to="/terms#paid-models-add-on-fleets" class="underline">license</NuxtLink>.
          Printing tips are on the <NuxtLink to="/parts" class="underline">parts page</NuxtLink>,
          and the <NuxtLink to="/rulebook/pdf/rulebook.pdf" external target="_blank" class="underline">rulebook</NuxtLink> is free.
          A file broken or missing? Email
          <a href="mailto:josh@thederf.com" class="underline text-[color:var(--gold)]">josh@thederf.com</a>.
        </p>
      </div>
    </template>
  </div>
</template>
