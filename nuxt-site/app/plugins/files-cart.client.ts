// Load the STL files cart from localStorage once the page has hydrated (so the
// server-rendered count and the first client render agree), then save every
// change. See composables/useFilesCart.ts.

export default defineNuxtPlugin((nuxtApp) => {
  const { ids, owned } = useFilesCart()
  let loaded = false

  // app:suspense:resolve fires when hydration of the page is done (and again
  // after every navigation, hence the flag). app:mounted is too early: the
  // page is still hydrating then.
  nuxtApp.hook('app:suspense:resolve', () => {
    if (loaded) return
    loaded = true
    // Merge, in case something was added before this ran.
    ids.value = [...new Set([...readStoredIds(FILES_CART_KEY), ...ids.value])]
    owned.value = [...new Set([...readStoredIds(OWNED_SETS_KEY), ...owned.value])]
    writeStoredIds(FILES_CART_KEY, ids.value)
    watch(ids, v => writeStoredIds(FILES_CART_KEY, v))
    watch(owned, v => writeStoredIds(OWNED_SETS_KEY, v))
  })

  // Another tab changed the cart.
  window.addEventListener('storage', (e) => {
    if (e.key === FILES_CART_KEY) ids.value = readStoredIds(FILES_CART_KEY)
    if (e.key === OWNED_SETS_KEY) owned.value = readStoredIds(OWNED_SETS_KEY)
  })
})
