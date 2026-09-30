<script setup lang="ts">
// /live (the first playtest) was merged into /playtests. The server redirect
// goes to that playtest's section. A fragment in the Location header
// replaces the one the browser had, so an old /live#changes link from
// outside lands on #first-playtest, which links to /changes. In-app
// navigation can see the hash, so /live#changes goes straight there.
const route = useRoute()
await navigateTo(
  route.hash === '#changes' ? '/changes' : { path: '/playtests', hash: '#first-playtest' },
  { redirectCode: 301, replace: true }
)
</script>

<template>
  <div />
</template>
