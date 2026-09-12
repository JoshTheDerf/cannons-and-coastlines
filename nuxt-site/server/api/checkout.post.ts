// Start a Stripe Checkout Session for a paid STL set.
//
// Talks to Stripe's REST API with fetch rather than the stripe SDK: the SDK
// pulls in Node built-ins that need shimming on Workers, and the two calls we
// make here are form-encoded one-liners. Same reason the webhook verifies
// signatures with WebCrypto directly.
//
// The price is never taken from the client. The client names a set; the price
// id comes from server/data/sets.json. Otherwise anyone could POST their own
// amount and buy a fleet for a cent.

import { findSet, isPurchasable } from '~~/server/utils/sets'
import { products } from '~~/server/utils/shopMock'

type Body = { setId?: string, email?: string }

export default defineEventHandler(async (event) => {
  const { setId, email } = await readBody<Body>(event)

  if (!setId) {
    throw createError({ statusCode: 400, statusMessage: 'setId is required' })
  }

  const set = findSet(setId)
  if (!set) {
    throw createError({ statusCode: 404, statusMessage: 'Unknown set' })
  }

  // Covers every not-for-sale case in one check: free sets, sets still flagged
  // coming-soon for the drip-feed, and sets whose Stripe price or amount has
  // not been filled in yet.
  if (!isPurchasable(set)) {
    throw createError({ statusCode: 409, statusMessage: `${set.title} is not available for purchase` })
  }

  const secret = (event.context.cloudflare?.env as Record<string, string> | undefined)?.STRIPE_SECRET_KEY
  if (!secret) {
    throw createError({ statusCode: 500, statusMessage: 'STRIPE_SECRET_KEY is not configured' })
  }

  // Every purchasable set is sold through exactly one store page. If that
  // link is missing the buyer would be returned to a 404 after paying, so
  // refuse before taking money rather than after.
  const handle = products.find(p => p.setId === set.id)?.handle
  if (!handle) {
    console.error('[checkout] no store page sells set', set.id)
    throw createError({ statusCode: 500, statusMessage: 'This set has no store page' })
  }

  const origin = getRequestURL(event).origin

  const form = new URLSearchParams({
    mode: 'payment',
    'line_items[0][price]': set.stripePriceId!,
    'line_items[0][quantity]': '1',
    // Back to the faction's store page, on its Digital tab. A set is reached
    // through the product that sells it, so the URL is the product handle
    // rather than the set id.
    success_url: `${origin}/shop/${handle}?purchased=1`,
    cancel_url: `${origin}/shop/${handle}`,
    // Read back by the webhook; safer than parsing the set out of line items.
    'metadata[set_id]': set.id,
    'payment_intent_data[metadata][set_id]': set.id
  })

  // The buyer's email is the identity an entitlement is keyed to, so it has to
  // come back on the completed session. When the page did not supply one,
  // Stripe collects it, which keeps us out of validating addresses ourselves.
  if (email) form.set('customer_email', email)

  const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${secret}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      // Stripe dedupes retries of the same logical request. Scoped per set per
      // minute so a double-clicked button does not open two sessions.
      'Idempotency-Key': `checkout:${set.id}:${Math.floor(Date.now() / 60000)}`
    },
    body: form
  })

  if (!res.ok) {
    // Stripe's error body can name the account and price; log it server-side
    // and hand the client something generic.
    console.error('[checkout] Stripe rejected the session', res.status, await res.text())
    throw createError({ statusCode: 502, statusMessage: 'Could not start checkout' })
  }

  const session = await res.json<{ id: string, url: string }>()
  return { id: session.id, url: session.url }
})
