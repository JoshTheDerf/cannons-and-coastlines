// Typed access to the STL set manifest (server/data/sets.json).
//
// Everything that decides "can this person buy or download this set" funnels
// through here so the rules live in one place rather than being re-derived in
// each route. The manifest is imported (not read from disk): Cloudflare
// Workers have no filesystem, so it is bundled into the Worker at build time.

import manifest from '~~/server/data/sets.json'

export type SetStatus = 'coming-soon' | 'available'

export type StlSet = {
  id: string
  title: string
  faction: string
  paid: boolean
  status: SetStatus
  /** R2 path segment. Bumped when the STLs themselves change. */
  version: string
  /** Repo-relative staging folder the publish script uploads from. */
  sourceDir: string
  /** Static URL for free sets; null for paid ones, which never have one. */
  freeDownloadUrl: string | null
  /** Stripe Price id. Null until the set is ready to sell. */
  stripePriceId: string | null
  priceUsd: number | null
  images: { preview: string, large: string }
  factionCard: string
}

export const sets: StlSet[] = (manifest.sets as StlSet[])

export const findSet = (id: string): StlSet | undefined =>
  sets.find(s => s.id === id)

/**
 * A set is purchasable only when every piece of the chain is actually in
 * place. Checked in one spot so a half-configured set fails closed at every
 * entry point instead of, say, taking money for files R2 does not have yet.
 */
export function isPurchasable(set: StlSet): boolean {
  return set.paid
    && set.status === 'available'
    && !!set.stripePriceId
    && typeof set.priceUsd === 'number'
}

/**
 * Whether a download may ever be served for this set, entitlement aside.
 * A 'coming-soon' set refuses even for someone holding an entitlement row,
 * which is what makes the drip-feed flag authoritative: un-flipping a set
 * pulls it back from everyone.
 */
export function isDownloadable(set: StlSet): boolean {
  return set.status === 'available'
}

/** R2 key prefix for a set's current version, e.g. "treasure-fleet-set/v1/". */
export const r2Prefix = (set: StlSet): string => `${set.id}/v${set.version}/`

/** Key of the bundled zip the download route hands out. */
export const r2ZipKey = (set: StlSet): string =>
  `${r2Prefix(set)}${set.id}-v${set.version}.zip`
