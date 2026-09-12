// The digital half of the store.
//
// Each faction's store page (/shop/<handle>) sells the same faction two ways:
// a printed box, which comes from the Shopify-shaped catalog in
// server/utils/shopMock.ts, and the STL files, which come from here. A
// product links to its set with `setId`, and the page tabs between them.
//
// Joins the two halves of a set. Commerce state (status, price, images) comes
// from /api/sets, which reads server/data/sets.json; the words come from the
// `factions` list in content/pages/home.yml, where they already live for the
// home page. Each faction entry carries a `set:` id that matches a manifest
// id, and that is the join.
//
// Keeping them apart means release state is never buried in prose: flipping a
// set to "available" in the manifest is what puts it on sale, and nobody has
// to remember to edit a second file.

export type FleetSet = {
  id: string
  title: string
  faction: string
  paid: boolean
  status: 'coming-soon' | 'available'
  purchasable: boolean
  priceUsd: number | null
  images: { preview: string, large: string }
  factionCard: string
  freeDownloadUrl: string | null
  // From home.yml, absent if a set has no faction entry yet.
  tagline?: string
  stats?: string[]
  desc?: string
}

type SetsResponse = { sets: Omit<FleetSet, 'tagline' | 'stats' | 'desc'>[] }

export function useFleetSets() {
  return useAsyncData('fleet-sets', async () => {
    const [manifest, home] = await Promise.all([
      $fetch<SetsResponse>('/api/sets'),
      queryCollection('pages').where('stem', '=', 'pages/home').first()
    ])

    const copy = new Map<string, Record<string, any>>()
    for (const faction of (home?.factions?.items ?? [])) {
      // Two base-game factions share the base-set id; first one wins, and
      // neither is a fleet pack, so it does not matter which.
      if (faction.set && !copy.has(faction.set)) copy.set(faction.set, faction)
    }

    const sets: FleetSet[] = manifest.sets.map(set => ({
      ...set,
      tagline: copy.get(set.id)?.tagline,
      stats: copy.get(set.id)?.stats,
      desc: copy.get(set.id)?.desc
    }))

    return { all: sets }
  })
}

/** "$12" — whole dollars, since that is how these are priced. */
export const formatPrice = (usd: number | null): string =>
  usd === null ? '' : `$${Number.isInteger(usd) ? usd : usd.toFixed(2)}`
