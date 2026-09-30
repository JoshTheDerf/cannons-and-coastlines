<script setup lang="ts">
// A short, muted, looping clip from playtest footage. It shows the poster
// until it scrolls near the viewport, then loads and plays; it pauses again
// off screen. Visitors who ask for reduced motion only get the poster.
const props = defineProps<{
  /** Path without extension: `${src}.mp4` and `${src}-poster.jpg` must exist. */
  src: string
  alt: string
}>()

const video = ref<HTMLVideoElement | null>(null)
let observer: IntersectionObserver | null = null

onMounted(() => {
  const el = video.value
  if (!el) return
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  if (!('IntersectionObserver' in window)) {
    el.preload = 'auto'
    el.play().catch(() => {})
    return
  }
  observer = new IntersectionObserver(([entry]) => {
    if (!entry) return
    if (entry.isIntersecting) {
      el.preload = 'auto'
      el.play().catch(() => {})
    } else {
      el.pause()
    }
  }, { rootMargin: '200px 0px' })
  observer.observe(el)
})

onBeforeUnmount(() => observer?.disconnect())
</script>

<template>
  <video
    ref="video"
    :poster="`${props.src}-poster.jpg`"
    :aria-label="props.alt"
    role="img"
    muted
    loop
    playsinline
    preload="none"
    disablepictureinpicture
    disableremoteplayback
  >
    <source :src="`${props.src}.mp4`" type="video/mp4">
  </video>
</template>
