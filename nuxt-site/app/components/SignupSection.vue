<script setup lang="ts">
const props = defineProps<{
  data: {
    eyebrow: string
    title: string
    body: string
    perks?: string[]
    publicRulebook?: { label: string, href: string }
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
  <section id="signup" class="py-20 px-4 bg-secondary-900/50">
    <div class="container mx-auto grid lg:grid-cols-[1.4fr_1fr] gap-10">
      <div>
        <p class="text-xs uppercase tracking-[0.25em] text-primary-400 mb-2 font-semibold">{{ data.eyebrow }}</p>
        <h2 class="font-display text-3xl text-white">{{ data.title }}</h2>
        <p class="mt-3 text-white/70 max-w-xl">{{ data.body }}</p>
        <ul v-if="data.perks?.length" class="mt-5 space-y-2 text-sm text-white/85">
          <li v-for="perk in data.perks" :key="perk" class="flex gap-2">
            <UIcon name="i-lucide-check" class="size-5 text-primary-300 shrink-0 mt-0.5" />
            <span>{{ perk }}</span>
          </li>
        </ul>
        <div ref="kitContainer" class="mt-6" />
        <p v-if="data.publicRulebook" class="mt-4 text-sm text-white/70">
          <a :href="data.publicRulebook.href" class="underline hover:text-primary-200">{{ data.publicRulebook.label }}</a>
        </p>
        <p class="mt-3 text-xs text-white/50">
          <NuxtLink to="/privacy" class="underline">Privacy Policy</NuxtLink>
        </p>
      </div>
      <div class="self-start rounded-2xl border border-white/10 bg-secondary-900/60 p-6 flex gap-5 items-start">
        <div class="flex-1 min-w-0">
          <h3 class="font-display text-lg text-white">{{ data.discord.title }}</h3>
          <p class="mt-2 text-sm text-white/70">{{ data.discord.body }}</p>
          <UButton :to="data.discord.url" target="_blank" icon="i-lucide-message-circle" color="primary" size="md" class="mt-4">
            Join the Discord
          </UButton>
        </div>
        <img :src="data.discord.qr" alt="Discord invite QR" class="size-28 rounded-lg bg-white p-1 shrink-0">
      </div>
    </div>
  </section>
</template>
