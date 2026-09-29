// An order's status and downloads, for the order page (/shop/order/<key>).
//
//   GET /api/order/<order key>
//
// Stripe redirects the buyer to that page after payment, and its URL is in
// the receipt email. The key is the credential; there is nothing else to log
// in with. Each call re-checks the payment with Stripe (see confirmOrder), so
// a refunded order stops offering downloads even without the webhook.

import { findOrder, isOrderKey, useDb } from '~~/server/utils/entitlement'
import { findSet } from '~~/server/utils/sets'
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
      factionCard: set.factionCard,
      handle: products.find(p => p.setId === set.id)?.handle ?? null,
      downloadUrl: state === 'paid' ? `/api/download/${set.id}?order=${key}` : null
    }]
  })

  return { state, email, sets }
})
