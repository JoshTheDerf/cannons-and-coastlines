<script setup lang="ts">
const { data: site } = await useAsyncData('site', () =>
  queryCollection('site').first()
)
</script>

<template>
  <div class="min-h-screen flex flex-col">
    <template v-if="site">
      <SiteAnnounce v-if="site.announce" :data="site.announce" />
      <SiteNav :data="site" />
      <main class="flex-1">
        <slot />
      </main>
      <SiteFooter :data="site.footer" :brand="site.brand" />
    </template>
    <ClientOnly>
      <CartDrawer />
    </ClientOnly>
  </div>
</template>
