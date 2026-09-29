// Stripe webhook: records completed orders and revokes refunded or disputed
// ones.
//
// The order page grants access too (it asks Stripe directly), so this is the
// backstop for a buyer who closes the tab before the redirect, and the only
// thing that revokes. It verifies the Stripe-Signature header before trusting
// a single field. Signature checking
// is done with WebCrypto rather than stripe.webhooks.constructEvent because
// the SDK's sync verification needs Node crypto, which Workers lack.
//
// Setup:
//   1. stripe listen / dashboard -> add endpoint https://<site>/api/stripe/webhook
//   2. subscribe to: checkout.session.completed,
//      checkout.session.async_payment_succeeded, charge.refunded,
//      charge.dispute.created
//   3. npx wrangler secret put STRIPE_WEBHOOK_SECRET   (the whsec_... value)

import type { H3Event } from 'h3'
import {
  claimStripeEvent, findOrder, isOrderKey, revokeEntitlement, useDb
} from '~~/server/utils/entitlement'
import { confirmOrder, stripeApi } from '~~/server/utils/stripe'

/** Stripe signs `${timestamp}.${rawBody}`; tolerate 5 minutes of clock skew. */
const TOLERANCE_SECONDS = 300

const hex = (buf: ArrayBuffer): string =>
  [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')

/** Constant-time compare; a fast-exit compare leaks the signature byte by byte. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

async function verifySignature(raw: string, header: string, secret: string): Promise<boolean> {
  // Header form: t=1690000000,v1=abc...,v1=def...  (multiple v1 during rotation)
  const parts = Object.create(null) as Record<string, string[]>
  for (const piece of header.split(',')) {
    const [k, v] = piece.split('=', 2)
    if (k && v) (parts[k] ??= []).push(v)
  }

  const timestamp = parts.t?.[0]
  const signatures = parts.v1 ?? []
  if (!timestamp || signatures.length === 0) return false

  // Reject replays of an old, validly-signed payload.
  const age = Math.abs(Date.now() / 1000 - Number(timestamp))
  if (!Number.isFinite(age) || age > TOLERANCE_SECONDS) return false

  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const mac = hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${raw}`)))

  return signatures.some(sig => timingSafeEqual(sig, mac))
}

export default defineEventHandler(async (event) => {
  const env = event.context.cloudflare?.env as Record<string, string> | undefined
  const secret = env?.STRIPE_WEBHOOK_SECRET
  if (!secret) {
    throw createError({ statusCode: 500, statusMessage: 'STRIPE_WEBHOOK_SECRET is not configured' })
  }

  const signature = getHeader(event, 'stripe-signature')
  // The raw body, byte for byte: the HMAC is over the exact bytes Stripe sent,
  // so re-serializing parsed JSON would not match.
  const raw = await readRawBody(event, 'utf8')

  if (!signature || !raw || !(await verifySignature(raw, signature, secret))) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid signature' })
  }

  const stripeEvent = JSON.parse(raw) as {
    id: string
    type: string
    data: { object: Record<string, any> }
  }

  const db = await useDb(event)

  // Stripe delivers at least once. Claim the event id first; if we have
  // already handled it, acknowledge and do nothing.
  if (!(await claimStripeEvent(db, stripeEvent.id, stripeEvent.type))) {
    return { received: true, duplicate: true }
  }

  try {
    await handle(event, db, stripeEvent)
  } catch (e) {
    // Let Stripe's retry through: un-claim, then fail the delivery.
    await db.prepare('DELETE FROM cc_stripe_events WHERE event_id = ?').bind(stripeEvent.id).run()
    throw e
  }
  return { received: true }
})

async function handle(event: H3Event, db: D1Database, stripeEvent: { type: string, data: { object: Record<string, any> } }) {
  const obj = stripeEvent.data.object

  switch (stripeEvent.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded': {
      const order = await orderFor(db, obj.metadata?.order_key)
      if (!order) {
        console.error('[stripe] session has no known order', obj.id)
        break
      }
      // Same path as the order page: ask Stripe for the settled state rather
      // than trusting this payload, then grant.
      const { state, email } = await confirmOrder(event, db, order)
      console.info('[stripe] order', state, order.setIds.join(','), email ?? '')
      break
    }

    case 'charge.refunded':
    case 'charge.dispute.created': {
      // A refund event carries the charge; a dispute carries its own object
      // pointing at one. Either way the order key is in the PaymentIntent's
      // metadata, set at checkout.
      const paymentIntent: string | undefined = obj.payment_intent
      if (stripeEvent.type === 'charge.refunded' && !obj.refunded) {
        // Partial refund: which set it was for is a judgement call, so leave
        // access alone and flag it.
        console.warn('[stripe] partial refund, access unchanged', obj.id)
        break
      }
      const intent = paymentIntent
        ? await stripeApi<{ metadata?: Record<string, string> }>(event, `payment_intents/${encodeURIComponent(paymentIntent)}`)
        : null
      const order = await orderFor(db, intent?.metadata?.order_key)
      if (!order?.email) {
        // Worth a human look: the money moved but we could not match a row.
        console.error('[stripe] could not match refund/dispute to an order', obj.id)
        break
      }
      for (const setId of order.setIds) await revokeEntitlement(db, order.email, setId)
      console.info('[stripe] revoked', order.setIds.join(','), 'from', order.email, 'via', stripeEvent.type)
      break
    }

    default:
      // Subscribed to more than we handle; acknowledging keeps Stripe from
      // retrying events we deliberately ignore.
      break
  }
}

async function orderFor(db: D1Database, key: unknown) {
  return isOrderKey(key) ? findOrder(db, key) : null
}
