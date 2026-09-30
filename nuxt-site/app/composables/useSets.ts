// The digital half of the store: each STL set's release state and price.
//
// Comes from /api/sets, which reads server/data/sets.json. That file decides
// whether a set can be bought; the fleet's words and pictures are in
// shared/data/fleets.json (a fleet's `set` is the join). Flipping a set to
// "available" in the manifest is what puts it on sale, and no page copy has
// to change with it.

export type FleetSet = {
  id: string
  title: string
  faction: string
  paid: boolean
  status: 'coming-soon' | 'available'
  purchasable: boolean
  priceUsd: number | null
  earlyBird: boolean
  images: { preview: string, large: string }
  freeDownloadUrl: string | null
}

export function useFleetSets() {
  return useAsyncData('fleet-sets', async () => {
    const { sets } = await $fetch<{ sets: FleetSet[] }>('/api/sets')
    return { all: sets }
  })
}

/** "$12" — whole dollars, since that is how these are priced. */
export const formatPrice = (usd: number | null): string =>
  usd === null ? '' : `$${Number.isInteger(usd) ? usd : usd.toFixed(2)}`
