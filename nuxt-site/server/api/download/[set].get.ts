// Serve a paid STL set to someone who owns it.
//
//   GET /api/download/<set-id>?token=<download token>
//
// The token comes from /api/download-link, which mints one for an address
// holding an entitlement. This route never accepts a bare email: an email is
// guessable, a 256-bit token is not.
//
// The file is streamed from R2 through the Worker rather than redirecting to a
// bucket URL. The bucket stays private with no public hostname, which is the
// whole point of keeping these files out of git — a public R2 URL would be
// just as permanent a leak as a commit.

import { consumeDownloadToken, hasEntitlement, useDb } from '~~/server/utils/entitlement'
import { findSet, isDownloadable, r2ZipKey } from '~~/server/utils/sets'

export default defineEventHandler(async (event) => {
  const setId = getRouterParam(event, 'set')!
  const token = getQuery(event).token as string | undefined

  const set = findSet(setId)
  if (!set) {
    throw createError({ statusCode: 404, statusMessage: 'Unknown set' })
  }

  // Free sets are plain static assets; there is nothing to gate.
  if (!set.paid) {
    if (set.freeDownloadUrl) return sendRedirect(event, set.freeDownloadUrl, 302)
    throw createError({ statusCode: 404, statusMessage: 'No download for this set' })
  }

  // The drip-feed flag wins over any entitlement: pulling a set back to
  // coming-soon stops serving it to everyone, including prior buyers.
  if (!isDownloadable(set)) {
    throw createError({ statusCode: 409, statusMessage: `${set.title} is not released yet` })
  }

  if (!token) {
    throw createError({ statusCode: 401, statusMessage: 'A download token is required' })
  }

  const db = useDb(event)

  // Single-use: consuming marks the token spent, so a leaked link in a
  // forwarded email cannot be replayed.
  const check = await consumeDownloadToken(db, token)
  if (!check.ok) {
    const message = check.reason === 'expired'
      ? 'This download link has expired. Request a new one.'
      : check.reason === 'used'
        ? 'This download link has already been used. Request a new one.'
        : 'Invalid download link.'
    throw createError({ statusCode: 403, statusMessage: message })
  }

  // The token is bound to one set; a token for set A must not open set B.
  if (check.setId !== set.id) {
    throw createError({ statusCode: 403, statusMessage: 'This link is for a different set' })
  }

  // Re-check the entitlement at download time rather than trusting the token
  // alone, so a refund between minting and use denies access.
  if (!(await hasEntitlement(db, check.email, set.id))) {
    throw createError({ statusCode: 403, statusMessage: 'No active purchase found for this set' })
  }

  const bucket = (event.context.cloudflare?.env as Record<string, unknown> | undefined)?.PAID_SETS as R2Bucket | undefined
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
