<script setup lang="ts">
// /parts was merged into /print-guide. Old links keep working: the server
// redirect carries no fragment, so the browser keeps the one it had and
// /parts#assembly lands on /print-guide#assembly (same section ids).
const route = useRoute()
await navigateTo({ path: '/print-guide', hash: route.hash || undefined }, { redirectCode: 301, replace: true })
</script>

<template>
  <div />
</template>
