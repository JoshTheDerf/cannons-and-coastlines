// Public, read-only view of the STL set manifest.
//
// The join key between marketing copy and commerce: content/pages/home.yml
// gives each faction card a `set:` id, and the page merges this response in to
// decide whether to render "Coming Soon" or a price and a buy button. That
// indirection is what makes the drip-feed a one-line change — flipping
// `status` in server/data/sets.json changes the site without touching a
// component or redeploying content.
//
// Only fields safe for anyone to see. sourceDir and stripePriceId stay server-
// side: one is a local path, the other belongs in checkout requests we build
// ourselves, never in a page a customer could tamper with.

import { isPurchasable, sets } from '~~/server/utils/sets'

export default defineEventHandler(() => ({
  sets: sets.map(set => ({
    id: set.id,
    title: set.title,
    faction: set.faction,
    paid: set.paid,
    status: set.status,
    purchasable: isPurchasable(set),
    priceUsd: set.priceUsd,
    images: set.images,
    factionCard: set.factionCard,
    // Present only for free sets; paid sets are reachable only through
    // /api/download-link and an entitlement.
    freeDownloadUrl: set.freeDownloadUrl
  }))
}))
