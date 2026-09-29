// Start a Stripe Checkout Session for one or more paid STL sets.
//
//   POST /api/checkout  { setIds: ['treasure-fleet-set', ...], from?: '/shop' }
//
// The price is never taken from the client. The client names sets; each line
// item is built from priceUsd in server/data/sets.json. Otherwise anyone could
// POST their own amount and buy a fleet for a cent.
//
// Before the session exists we mint an order key and put the order page URL
// in the payment description. Stripe prints that description in the receipt
// email, which is how a buyer gets their download link without this site
// sending any mail of its own.

import { createOrder, newOrderKey, useDb } from '~~/server/utils/entitlement'
import { findSet, isPurchasable } from '~~/server/utils/sets'
import { stripeApi } from '~~/server/utils/stripe'

type Body = { setIds?: unknown, setId?: unknown, from?: unknown }

export default defineEventHandler(async (event) => {
  const body = await readBody<Body>(event)
  const requested = Array.isArray(body?.setIds) ? body.setIds : body?.setId ? [body.setId] : []
  const ids = [...new Set(requested.filter((x): x is string => typeof x === 'string'))]

  if (ids.length === 0 || ids.length > 20) {
    throw createError({ statusCode: 400, statusMessage: 'setIds is required' })
  }

  const chosen = ids.map((id) => {
    const set = findSet(id)
    if (!set) throw createError({ statusCode: 404, statusMessage: 'Unknown set' })
    // Covers every not-for-sale case in one check: free sets, sets still
    // flagged coming-soon for the drip-feed, and sets with no price yet.
    if (!isPurchasable(set)) {
      throw createError({ statusCode: 409, statusMessage: `${set.title} is not available for purchase` })
    }
    return set
  })

  const origin = getRequestURL(event).origin
  // Back to the page the buyer came from if they cancel. Only a path on this
  // site, so the parameter cannot be used to bounce people elsewhere.
  const from = typeof body?.from === 'string' && /^\/[\w\-/]*$/.test(body.from) ? body.from : '/shop'

  const db = await useDb(event)
  const orderKey = newOrderKey()
  const orderUrl = `${origin}/shop/order/${orderKey}`
  const names = chosen.map(s => s.title).join(', ')

  const form = new URLSearchParams({
    'mode': 'payment',
    'success_url': orderUrl,
    'cancel_url': `${origin}${from}`,
    // Read back by the webhook and the order page.
    'metadata[order_key]': orderKey,
    'metadata[set_ids]': ids.join(','),
    // Copied onto the PaymentIntent (and its charge), so refunds and disputes
    // can be traced back to the order.
    'payment_intent_data[metadata][order_key]': orderKey,
    'payment_intent_data[metadata][set_ids]': ids.join(','),
    // Shown in the Stripe receipt email and dashboard.
    'payment_intent_data[description]': `Cannons & Coastlines STL files: ${names}. Download them at ${orderUrl}`,
    'custom_text[submit][message]': 'Your download link opens right after payment, and it is in your receipt email too.',
    'allow_promotion_codes': 'true'
  })

  chosen.forEach((set, i) => {
    form.set(`line_items[${i}][quantity]`, '1')
    form.set(`line_items[${i}][price_data][currency]`, 'usd')
    form.set(`line_items[${i}][price_data][unit_amount]`, String(Math.round(set.priceUsd! * 100)))
    form.set(`line_items[${i}][price_data][product_data][name]`, `${set.title} STL files`)
    form.set(`line_items[${i}][price_data][product_data][description]`,
      set.earlyBird ? 'Printable 3D model files, personal license. Early bird price.' : 'Printable 3D model files, personal license.')
    form.set(`line_items[${i}][price_data][product_data][images][0]`, `${origin}${set.images.preview.split('?')[0]}`)
    form.set(`line_items[${i}][price_data][product_data][metadata][set_id]`, set.id)
  })

  const session = await stripeApi<{ id: string, url: string }>(event, 'checkout/sessions', {
    form,
    // One key per order, so a retried request cannot open a second session
    // for the same order.
    idempotencyKey: `checkout:${orderKey}`
  })

  await createOrder(db, orderKey, session.id, ids)
  return { url: session.url }
})
