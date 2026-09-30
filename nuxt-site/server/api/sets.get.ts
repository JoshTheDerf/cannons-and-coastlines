// Public, read-only view of the STL set manifest.
//
// The join key between the fleets and commerce: each fleet in
// shared/data/fleets.json names its `set`, and pages use this response to
// decide whether to show "Coming Soon" or a price and a buy button. That
// indirection is what makes the drip-feed a one-line change: flipping
// `status` in server/data/sets.json changes the site without touching a
// component or any copy.
//
// Only fields safe for anyone to see. sourceDir stays server-side:
// it is a local path. The price shown here is for display only; checkout
// re-reads it from the manifest rather than trusting what a page sends.

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
    earlyBird: !!set.earlyBird,
    images: set.images,
    // Present only for free sets; paid sets are reachable only through
    // /api/download-link and an entitlement.
    freeDownloadUrl: set.freeDownloadUrl
  }))
}))
