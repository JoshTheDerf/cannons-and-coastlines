<script setup lang="ts">
const props = defineProps<{
  data: {
    title: string
    body: string
    perks?: string[]
    publicRulebook?: { label: string, href: string }
    partsLink?: { label: string, to: string }
    kitUid: string
    kitSrc: string
    discord: {
      title: string
      body: string
      url: string
      qr: string
    }
  }
}>()

const kitContainer = ref<HTMLDivElement | null>(null)

onMounted(() => {
  if (!kitContainer.value) return
  // Kit's embed script injects the form into the parent of its <script> tag, so
  // appending the script element directly into our container makes the form
  // land where we want it. Doing this in onMounted (not via a templated <script>
  // tag, which Vue strips at compile time) is what actually makes it execute.
  const s = document.createElement('script')
  s.async = true
  s.dataset.uid = props.data.kitUid
  s.src = props.data.kitSrc
  kitContainer.value.appendChild(s)
})
</script>

<template>
  <section id="files" class="band-deck py-20 px-4">
    <span id="signup" class="sr-only" />
    <div class="container mx-auto grid lg:grid-cols-[1.4fr_1fr] gap-12">
      <div>
        <h2 class="font-display text-3xl md:text-4xl text-ink">{{ data.title }}</h2>
        <p class="mt-4 font-serif lead text-ink-soft max-w-xl">{{ data.body }}</p>
        <ul v-if="data.perks?.length" class="list-diamond mt-5 space-y-2 font-serif text-ink-soft">
          <li v-for="perk in data.perks" :key="perk">{{ perk }}</li>
        </ul>
        <div ref="kitContainer" class="mt-6 kit-form" />
        <p class="mt-5 font-serif text-sm text-ink-soft space-x-4">
          <a v-if="data.publicRulebook" :href="data.publicRulebook.href" class="underline hover:text-ink">{{ data.publicRulebook.label }}</a>
        </p>
        <p v-if="data.partsLink" class="mt-2 font-serif text-sm text-ink-soft">
          <NuxtLink :to="data.partsLink.to" class="underline hover:text-ink">{{ data.partsLink.label }}</NuxtLink>
        </p>
        <p class="mt-2 text-sm text-ink-faint">
          <NuxtLink to="/privacy" class="underline">Privacy policy</NuxtLink>
        </p>
      </div>
      <div class="card-deck self-start p-6 flex gap-5 items-start">
        <div class="flex-1 min-w-0">
          <h3 class="font-display text-xl">{{ data.discord.title }}</h3>
          <p class="mt-2 font-serif text-ink-soft">{{ data.discord.body }}</p>
          <UButton :to="data.discord.url" target="_blank" icon="i-lucide-message-circle" variant="ghost" color="neutral" class="btn-ink mt-4">
            Open Discord
          </UButton>
        </div>
        <img :src="data.discord.qr" alt="Discord invite QR code" class="hidden sm:block size-24 rounded-sm bg-white p-1 shrink-0">
      </div>
    </div>
  </section>
</template>
