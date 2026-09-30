// The STL files cart: a list of paid set ids, kept in this browser.
//
// It holds ids only. Prices, titles and whether a set can be bought come from
// /api/sets when the cart is shown, and /api/checkout re-reads the price from
// server/data/sets.json and refuses unknown or unavailable sets, so nothing
// stored here is trusted. The printed-kit cart in useShop() is separate.
//
// State is shared across pages with useState and saved to localStorage by
// plugins/files-cart.client.ts. localStorage can be missing or throw (private
// windows, blocked storage), in which case the cart still works for the visit
// and just isn't remembered.

export const FILES_CART_KEY = 'cnc.filesCart'
// Set ids this browser has bought, remembered by the order page, so the cart
// can say so. Only ids: the order key (the download link) is never stored.
export const OWNED_SETS_KEY = 'cnc.ownedSets'
const MAX_ITEMS = 20

// The add-on fleets (shared/data/fleets.json), by every name the site uses
// for them: fleet name, shop handle or set id.
export const ADDON_FLEETS = FLEETS
  .filter(f => f.group === 'addon')
  .map(f => ({ name: f.name, handle: f.id, setId: f.set }))

/** Look an add-on fleet up by name, shop handle or set id. */
export const findAddonFleet = (key: string) =>
  ADDON_FLEETS.find(f => f.name === key || f.handle === key || f.setId === key) ?? null

export function readStoredIds(key: string): string[] {
  try {
    const v = JSON.parse(window.localStorage.getItem(key) ?? '[]')
    return Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string'))].slice(0, MAX_ITEMS) : []
  } catch {
    return []
  }
}

export function writeStoredIds(key: string, ids: string[]) {
  try {
    window.localStorage.setItem(key, JSON.stringify(ids))
  } catch {
    // Storage is full or blocked; the in-memory cart still works.
  }
}

export function useFilesCart() {
  const ids = useState<string[]>('files-cart', () => [])
  const owned = useState<string[]>('files-cart-owned', () => [])
  const open = useState<boolean>('cart-drawer-open', () => false)

  const has = (id: string) => ids.value.includes(id)
  function add(id: string) {
    if (!has(id) && ids.value.length < MAX_ITEMS) ids.value = [...ids.value, id]
  }
  const addMany = (list: string[]) => list.forEach(add)
  const remove = (id: string) => { ids.value = ids.value.filter(x => x !== id) }
  const clear = () => { ids.value = [] }

  // Starts a Stripe Checkout for these sets (the cart, or one set for Buy
  // now) and leaves the page. Throws the server's message on failure.
  async function checkout(setIds: string[], from: string) {
    const { url } = await $fetch<{ url: string }>('/api/checkout', {
      method: 'POST',
      body: { setIds, from }
    })
    await navigateTo(url, { external: true })
  }

  return { ids, owned, open, has, add, addMany, remove, clear, checkout }
}

/** The error text /api/checkout sent, or a generic one. */
export const checkoutError = (e: any): string =>
  e?.data?.statusMessage ?? 'Could not start checkout. Please try again.'
