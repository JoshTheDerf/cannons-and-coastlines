// An order's status and downloads, for the order page (/shop/order/<key>).
//
//   GET /api/order/<order key>
//
// Stripe redirects the buyer to that page after payment, and its URL is in
// the receipt email. The key is the credential; there is nothing else to log
// in with. Each call re-checks the payment with Stripe (see confirmOrder), so
// a refunded order stops offering downloads even without the webhook.

import { findOrder, isOrderKey, useDb } from '~~/server/utils/entitlement'
import { bundles, findSet, orderCoversBundle, r2BundleKey } from '~~/server/utils/sets'
import { products } from '~~/server/utils/shopMock'
import { confirmOrder } from '~~/server/utils/stripe'

export default defineEventHandler(async (event) => {
  const key = getRouterParam(event, 'key')
  // Same answer for a malformed key and an unknown one.
  if (!isOrderKey(key)) throw createError({ statusCode: 404, statusMessage: 'Order not found' })

  const db = await useDb(event)
  const order = await findOrder(db, key)
  if (!order) throw createError({ statusCode: 404, statusMessage: 'Order not found' })

  const { state, email } = await confirmOrder(event, db, order)

  // The order key is a download credential in the URL; keep it out of caches.
  setHeader(event, 'Cache-Control', 'private, no-store')
  setHeader(event, 'Referrer-Policy', 'no-referrer')

  const sets = order.setIds.flatMap((id) => {
    const set = findSet(id)
    if (!set) return []
    return [{
      id: set.id,
      title: set.title,
      version: set.version,
      image: set.images.preview,
      handle: products.find(p => p.setId === set.id)?.handle ?? null,
      downloadUrl: state === 'paid' ? `/api/download/${set.id}?order=${key}` : null
    }]
  })

  // An order with every add-on fleet gets them as one zip. Offered only once
  // that exact zip is in R2 (its key moves whenever a set is bumped, and
  // publish-paid-sets.sh rebuilds it); until then the per-set links above
  // are the whole story, so a stale bundle never becomes a dead end.
  const bucket = (event.context.cloudflare?.env as Record<string, unknown> | undefined)?.PAID_SETS as R2Bucket | undefined
  let bundle: { id: string, title: string, folders: string[], downloadUrl: string } | null = null
  if (state === 'paid' && bucket) {
    for (const b of bundles) {
      if (!orderCoversBundle(b, order.setIds)) continue
      if (!(await bucket.head(r2BundleKey(b)))) continue
      bundle = {
        id: b.id,
        title: b.title,
        folders: b.includes.map(i => findSet(i.set)?.faction ?? i.set),
        downloadUrl: `/api/download/${b.id}?order=${key}`
      }
      break
    }
  }

  return { state, email, sets, bundle }
})
