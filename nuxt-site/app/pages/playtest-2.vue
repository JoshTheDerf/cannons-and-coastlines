<script setup lang="ts">
// /playtest-2 was merged into /playtests, where playtest #2 comes first. The
// server redirect carries no fragment, so the browser keeps the one it had:
// /playtest-2#changes lands on /playtests#changes, which hops on to /changes
// (see playtests.vue). In-app navigation can see the hash, so it goes there
// directly.
const route = useRoute()
await navigateTo(
  route.hash === '#changes' ? '/changes' : { path: '/playtests', hash: route.hash || undefined },
  { redirectCode: 301, replace: true }
)
</script>

<template>
  <div />
</template>
