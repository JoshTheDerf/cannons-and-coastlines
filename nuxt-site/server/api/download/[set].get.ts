// Serve a paid STL set to someone who owns it.
//
//   GET /api/download/<set-id>?order=<order key>
//   GET /api/download/<bundle-id>?order=<order key>
//
// A bundle id (server/data/sets.json `bundles`, e.g. all-fleets) serves one
// zip of several sets, to an order that covers every paid set in it.
//
// The order key is the buyer's download link (/shop/order/<key>, see
// server/utils/entitlement.ts). The order page links here once Stripe has
// confirmed the payment. This route never accepts a bare email: an email is
// guessable, a 128-bit order key is not.
//
// The file is streamed from R2 through the Worker rather than redirecting to a
// bucket URL. The bucket stays private with no public hostname, which is the
// whole point of keeping these files out of git — a public R2 URL would be
// just as permanent a leak as a commit.
//
// TEMPORARY share links:
//
//   GET /api/download/<set-id>?share=<PAID_SHARE_TOKEN>
//
// While the Worker secret PAID_SHARE_TOKEN is set, a matching `share` value
// skips the order link and the entitlement check, so
// playtesters can grab any paid set before it is on sale. It is one shared
// secret for every set, so treat a link as leaked once it leaves the group.
// Revoke by deleting the secret (`wrangler secret delete PAID_SHARE_TOKEN`);
// with it unset the parameter is ignored and nothing below changes.

import { isShared, requirePurchase } from '~~/server/utils/downloadAuth'
import { bundlePaidSets, findBundle, findSet, r2BundleKey, r2ZipKey } from '~~/server/utils/sets'
import { allowSlicer } from '~~/server/utils/slicerCors'

export default defineEventHandler(async (event) => {
  // CubbySlicer may read the download too (server/utils/slicerCors.ts).
  allowSlicer(event)
  const setId = getRouterParam(event, 'set')!
  const query = getQuery(event)
  const orderKey = query.order
  const share = query.share as string | undefined
  const env = event.context.cloudflare?.env as Record<string, unknown> | undefined

  const set = findSet(setId)
  const bundle = set ? undefined : findBundle(setId)
  if (!set && !bundle) {
    throw createError({ statusCode: 404, statusMessage: 'Unknown set' })
  }

  // Free sets are plain static assets; there is nothing to gate.
  if (set && !set.paid) {
    if (set.freeDownloadUrl) return sendRedirect(event, set.freeDownloadUrl, 302)
    throw createError({ statusCode: 404, statusMessage: 'No download for this set' })
  }

  const shared = isShared(event, share)

  // A bundle is every one of its paid sets at once, so the order has to
  // cover (and still be entitled to) each of them.
  const required = set ? [set] : bundlePaidSets(bundle!)
  if (!shared) {
    await requirePurchase(event, required, orderKey)
  }

  const bucket = env?.PAID_SETS as R2Bucket | undefined
  if (!bucket) {
    throw createError({ statusCode: 500, statusMessage: 'R2 binding PAID_SETS is not configured' })
  }

  const key = set ? r2ZipKey(set) : r2BundleKey(bundle!)
  const object = await bucket.get(key)
  if (!object) {
    // Manifest and bucket disagree: the set was flagged available before
    // publish-paid-sets.sh pushed it, or the version was bumped without a
    // re-publish. Loud, because it means a paying customer hit a dead end.
    console.error('[download] manifest points at a missing R2 object', key)
    throw createError({ statusCode: 503, statusMessage: 'These files are not ready yet. Please contact us.' })
  }

  const filename = set ? `${set.id}-v${set.version}.zip` : `${bundle!.zipBaseName}.zip`
  setHeaders(event, {
    'Content-Type': 'application/zip',
    'Content-Length': String(object.size),
    'Content-Disposition': `attachment; filename="${filename}"`,
    // Paid content: never let a shared cache hold a copy.
    'Cache-Control': 'private, no-store'
  })

  return object.body
})
