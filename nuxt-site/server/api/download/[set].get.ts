// Serve a paid STL set to someone who owns it.
//
//   GET /api/download/<set-id>?order=<order key>
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
// skips the release flag, the order link and the entitlement check, so
// playtesters can grab any paid set before it is on sale. It is one shared
// secret for every set, so treat a link as leaked once it leaves the group.
// Revoke by deleting the secret (`wrangler secret delete PAID_SHARE_TOKEN`);
// with it unset the parameter is ignored and nothing below changes.

import type { H3Event } from 'h3'
import { findOrder, hasEntitlement, isOrderKey, useDb } from '~~/server/utils/entitlement'
import { findSet, isDownloadable, r2ZipKey } from '~~/server/utils/sets'

// Constant-time, so response timing cannot be used to guess the secret a
// character at a time.
function sameSecret(given: string, expected: string): boolean {
  const a = new TextEncoder().encode(given)
  const b = new TextEncoder().encode(expected)
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!
  return diff === 0
}

export default defineEventHandler(async (event) => {
  const setId = getRouterParam(event, 'set')!
  const query = getQuery(event)
  const orderKey = query.order
  const share = query.share as string | undefined
  const env = event.context.cloudflare?.env as Record<string, unknown> | undefined

  const set = findSet(setId)
  if (!set) {
    throw createError({ statusCode: 404, statusMessage: 'Unknown set' })
  }

  // Free sets are plain static assets; there is nothing to gate.
  if (!set.paid) {
    if (set.freeDownloadUrl) return sendRedirect(event, set.freeDownloadUrl, 302)
    throw createError({ statusCode: 404, statusMessage: 'No download for this set' })
  }

  const shareToken = typeof env?.PAID_SHARE_TOKEN === 'string' ? env.PAID_SHARE_TOKEN : ''
  const shared = Boolean(shareToken && share && sameSecret(share, shareToken))

  if (!shared) {
    await requirePurchase(event, set, orderKey)
  }

  const bucket = env?.PAID_SETS as R2Bucket | undefined
  if (!bucket) {
    throw createError({ statusCode: 500, statusMessage: 'R2 binding PAID_SETS is not configured' })
  }

  const key = r2ZipKey(set)
  const object = await bucket.get(key)
  if (!object) {
    // Manifest and bucket disagree: the set was flagged available before
    // publish-paid-sets.sh pushed it, or the version was bumped without a
    // re-publish. Loud, because it means a paying customer hit a dead end.
    console.error('[download] manifest points at a missing R2 object', key)
    throw createError({ statusCode: 503, statusMessage: 'These files are not ready yet. Please contact us.' })
  }

  const filename = `${set.id}-v${set.version}.zip`
  setHeaders(event, {
    'Content-Type': 'application/zip',
    'Content-Length': String(object.size),
    'Content-Disposition': `attachment; filename="${filename}"`,
    // Paid content: never let a shared cache hold a copy.
    'Cache-Control': 'private, no-store'
  })

  return object.body
})

// The normal path: a released set, a paid order that includes it, and a live
// entitlement behind it. Throws on any failure.
async function requirePurchase(event: H3Event, set: NonNullable<ReturnType<typeof findSet>>, orderKey: unknown) {
  // The drip-feed flag wins over any entitlement: pulling a set back to
  // coming-soon stops serving it to everyone, including prior buyers.
  if (!isDownloadable(set)) {
    throw createError({ statusCode: 409, statusMessage: `${set.title} is not released yet` })
  }

  if (!isOrderKey(orderKey)) {
    throw createError({ statusCode: 401, statusMessage: 'A download link is required' })
  }

  const db = await useDb(event)
  const order = await findOrder(db, orderKey)
  // email is filled in only once the order page or the webhook has seen the
  // payment confirmed by Stripe; before that the order grants nothing.
  if (!order || !order.email || !order.setIds.includes(set.id)) {
    throw createError({ statusCode: 403, statusMessage: 'Invalid download link' })
  }

  // The entitlement is what a refund or dispute revokes, so check it on every
  // download rather than trusting the order row alone.
  if (!(await hasEntitlement(db, order.email, set.id))) {
    throw createError({ statusCode: 403, statusMessage: 'No active purchase found for this set' })
  }
}
