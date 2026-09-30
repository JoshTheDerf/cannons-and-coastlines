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
  /** Whole-dollar price; checkout builds the Stripe line item from it. */
  priceUsd: number | null
  /** Label the price as an early-bird price in the shop. */
  earlyBird?: boolean
  images: { preview: string, large: string }
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
    && typeof set.priceUsd === 'number'
    && set.priceUsd > 0
}

/** R2 key prefix for a set's current version, e.g. "treasure-fleet-set/v1/". */
export const r2Prefix = (set: StlSet): string => `${set.id}/v${set.version}/`

/** Key of the set's zip the download route hands out. */
export const r2ZipKey = (set: StlSet): string =>
  `${r2Prefix(set)}${set.id}-v${set.version}.zip`

// ── Bundles ─────────────────────────────────────────────────────────────
// One zip holding several sets, a folder each, with the print guide on top.
// Not a product of its own: an order that includes every paid set in a
// bundle gets the bundle's zip as well. See "BUNDLES" in server/data/sets.json.

export type Bundle = {
  id: string
  title: string
  /** Download filename, without .zip. */
  zipBaseName: string
  includes: { set: string, folder: string }[]
}

export const bundles: Bundle[] = ((manifest as { bundles?: Bundle[] }).bundles ?? [])

export const findBundle = (id: string): Bundle | undefined =>
  bundles.find(b => b.id === id)

const bundleSets = (bundle: Bundle): StlSet[] =>
  bundle.includes.map((i) => {
    const set = findSet(i.set)
    if (!set) throw new Error(`bundle ${bundle.id} includes unknown set ${i.set}`)
    return set
  })

/** The paid sets an order must include to get this bundle. */
export const bundlePaidSets = (bundle: Bundle): StlSet[] =>
  bundleSets(bundle).filter(s => s.paid)

/** Does an order's set list cover every paid set in the bundle? */
export const orderCoversBundle = (bundle: Bundle, setIds: string[]): boolean =>
  bundlePaidSets(bundle).every(s => setIds.includes(s.id))

/**
 * R2 key of a bundle's zip. The middle segment names every included set's
 * version, so a bump anywhere moves the key and a stale zip is never served.
 * scripts/build-paid-zips.sh builds the same string; keep the two in step.
 */
export const r2BundleKey = (bundle: Bundle): string => {
  const stamp = bundleSets(bundle).map(s => `${s.id}-v${s.version}`).join('_')
  return `${bundle.id}/${stamp}/${bundle.zipBaseName}.zip`
}

// ── Single files ────────────────────────────────────────────────────────
// Each paid STL and print-plate 3MF is also in R2 on its own, so the print
// list can open one in CubbySlicer (/api/download/<set>/<file>).
// scripts/build-paid-zips.sh lays them out the same way.

/** An STL or 3MF name as the build scripts write them. */
export const isModelFileName = (s: string): boolean => /^[a-z0-9][a-z0-9-]*\.(stl|3mf)$/.test(s)

/** `<set>/v<version>/files/<name>.stl` or `<set>/v<version>/plates/<name>.3mf`. */
export const r2FileKey = (set: StlSet, file: string): string =>
  `${r2Prefix(set)}${file.endsWith('.3mf') ? 'plates' : 'files'}/${file}`
