<script setup lang="ts">
const props = defineProps<{ text?: string | null, tag?: string }>()

function escape(s: string) {
  return s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!))
}

const html = computed(() => {
  const raw = props.text ?? ''
  let s = escape(raw)
  // [text](url) — must run before bold/italic so brackets stay intact
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, t, u) => {
    const ext = /^https?:\/\//.test(u)
    return `<a href="${u}" class="underline hover:text-primary-300"${ext ? ' target="_blank" rel="noopener"' : ''}>${t}</a>`
  })
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  s = s.replace(/(^|[\s(])\*([^*]+)\*/g, '$1<em>$2</em>')
  return s
})
</script>

<template>
  <component :is="tag ?? 'span'" v-html="html" />
</template>
