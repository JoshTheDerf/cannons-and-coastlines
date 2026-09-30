// One file from a paid set, for opening in Cubby Slicer from the print list.
//
//   GET /api/download/<set-id>/<file>.stl?order=<order key>
//   GET /api/download/<set-id>/<file>.3mf?order=<order key>   (a print plate)
//   GET /api/download/<set-id>/<file>?share=<PAID_SHARE_TOKEN>
//
// The same check as the zip (/api/download/<set-id>, see there): an order key
// with a live entitlement to the set, or the temporary share token. Nothing
// else. Files come from R2 (r2FileKey in server/utils/sets.ts), put there by
// scripts/publish-paid-sets.sh.
//
// Cubby Slicer (https://cubbycad.com/slicer/?model=<this URL>) fetches the
// file from its own origin, so this route allows that one origin by CORS
// (server/utils/slicerCors.ts). No cookies are involved: the key is in the
// URL, as for the zip.

import { isShared, requirePurchase } from '~~/server/utils/downloadAuth'
import { findSet, isModelFileName, r2FileKey } from '~~/server/utils/sets'
import { allowSlicer } from '~~/server/utils/slicerCors'

export default defineEventHandler(async (event) => {
  // First, so the slicer can read the error status too.
  allowSlicer(event)

  const set = findSet(getRouterParam(event, 'set')!)
  const file = getRouterParam(event, 'file')!
  if (!set || !set.paid || !isModelFileName(file)) {
    throw createError({ statusCode: 404, statusMessage: 'Unknown file' })
  }

  const query = getQuery(event)
  if (!isShared(event, query.share)) {
    await requirePurchase(event, [set], query.order)
  }

  const env = event.context.cloudflare?.env as Record<string, unknown> | undefined
  const bucket = env?.PAID_SETS as R2Bucket | undefined
  if (!bucket) {
    throw createError({ statusCode: 500, statusMessage: 'R2 binding PAID_SETS is not configured' })
  }
  const object = await bucket.get(r2FileKey(set, file))
  if (!object) {
    throw createError({ statusCode: 404, statusMessage: 'No such file in this set' })
  }

  setHeaders(event, {
    'Content-Type': file.endsWith('.3mf') ? 'model/3mf' : 'model/stl',
    'Content-Length': String(object.size),
    'Content-Disposition': `attachment; filename="${file}"`,
    'Cache-Control': 'private, no-store'
  })
  return object.body
})
