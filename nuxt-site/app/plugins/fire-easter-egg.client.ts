// Type "fire" anywhere on the site to launch the hidden web game.
// Resets if you pause for 1.5 seconds or press something off-sequence.
export default defineNuxtPlugin(() => {
  const target = 'fire'
  let buffer = ''
  let timer: ReturnType<typeof setTimeout> | null = null

  const reset = () => { buffer = '' }

  window.addEventListener('keydown', (e) => {
    // Ignore when the user is typing in a form field.
    const t = e.target as HTMLElement | null
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
    if (e.metaKey || e.ctrlKey || e.altKey) return
    if (e.key.length !== 1) return

    buffer = (buffer + e.key.toLowerCase()).slice(-target.length)
    if (timer) clearTimeout(timer)
    timer = setTimeout(reset, 1500)

    if (buffer === target) {
      reset()
      window.location.href = '/game/'
    }
  })
})
