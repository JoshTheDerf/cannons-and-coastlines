<script setup lang="ts">
// Rendered Blender cinematic (scripts/blender/hero_battle.py) behind the
// hero copy. Muted, looping and inline so browsers allow autoplay; visitors
// who ask for reduced motion get the still poster instead.
const src = '/assets/videos/hero-battle'
const video = ref<HTMLVideoElement | null>(null)

onMounted(() => {
  const el = video.value
  if (!el) return
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    el.pause()
    return
  }
  el.play().catch(() => {})
})
</script>

<template>
  <div class="hero-video" aria-hidden="true">
    <video
      ref="video"
      :poster="`${src}-poster.jpg`"
      muted
      loop
      playsinline
      preload="auto"
      disablepictureinpicture
    >
      <source :src="`${src}.webm`" type="video/webm">
      <source :src="`${src}.mp4`" type="video/mp4">
    </video>
  </div>
</template>

<style scoped>
.hero-video {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  overflow: hidden;
}
.hero-video video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: 50% 40%;
}
/* Darken toward the middle and bottom so the wordmark and copy stay legible
   over bright sky and sea. */
.hero-video::after {
  content: "";
  position: absolute;
  inset: 0;
  background:
    radial-gradient(48% 55% at 50% 45%, rgba(12, 9, 6, 0.62) 0%, rgba(12, 9, 6, 0.38) 60%, rgba(12, 9, 6, 0.1) 100%),
    linear-gradient(180deg, rgba(12, 9, 6, 0.25) 0%, transparent 25%, transparent 70%, rgba(12, 9, 6, 0.5) 100%);
}
/* On a phone the copy covers nearly the whole frame, so the scrim has to
   hold behind all of it: white sails and bright sky pass right under the
   text. */
@media (max-width: 767px) {
  .hero-video::after {
    background:
      radial-gradient(90% 60% at 50% 45%, rgba(12, 9, 6, 0.6) 0%, rgba(12, 9, 6, 0.45) 100%),
      linear-gradient(180deg, rgba(12, 9, 6, 0.2) 0%, transparent 30%, rgba(12, 9, 6, 0.35) 100%);
  }
}
</style>
