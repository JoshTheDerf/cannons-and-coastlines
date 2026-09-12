// Stripe webhook: turns a completed payment into an entitlement row.
//
// This endpoint is the only thing that grants access, so it verifies the
// Stripe-Signature header before trusting a single field. Signature checking
// is done with WebCrypto rather than stripe.webhooks.constructEvent because
// the SDK's sync verification needs Node crypto, which Workers lack.
//
// Setup:
//   1. stripe listen / dashboard -> add endpoint https://<site>/api/stripe/webhook
//   2. subscribe to: checkout.session.completed, charge.refunded,
//      charge.dispute.created
//   3. npx wrangler secret put STRIPE_WEBHOOK_SECRET   (the whsec_... value)

import {
  claimStripeEvent, grantEntitlement, revokeEntitlement, useDb
} from '~~/server/utils/entitlement'
import { findSet } from '~~/server/utils/sets'

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

  const db = useDb(event)

  // Stripe delivers at least once. Claim the event id first; if we have
  // already handled it, acknowledge and do nothing.
  if (!(await claimStripeEvent(db, stripeEvent.id, stripeEvent.type))) {
    return { received: true, duplicate: true }
  }

  const obj = stripeEvent.data.object

  switch (stripeEvent.type) {
    case 'checkout.session.completed': {
      // A session can complete while payment is still pending (some methods
      // settle asynchronously). Only a paid session grants access.
      if (obj.payment_status !== 'paid') {
        console.warn('[stripe] session completed but unpaid', obj.id, obj.payment_status)
        break
      }

      const email: string | undefined =
        obj.customer_details?.email ?? obj.customer_email
      const setId: string | undefined = obj.metadata?.set_id

      if (!email || !setId) {
        console.error('[stripe] session missing email or set_id', obj.id)
        break
      }
      if (!findSet(setId)) {
        console.error('[stripe] session names an unknown set', obj.id, setId)
        break
      }

      await grantEntitlement(db, {
        email,
        setId,
        stripeSession: obj.id,
        stripePayment: obj.payment_intent,
        amountCents: obj.amount_total
      })
      console.info('[stripe] granted', setId, 'to', email)
      break
    }

    case 'charge.refunded':
    case 'charge.dispute.created': {
      // Pull the set from the payment intent metadata we set at checkout.
      const email: string | undefined = obj.billing_details?.email ?? obj.receipt_email
      const setId: string | undefined = obj.metadata?.set_id
      if (email && setId) {
        await revokeEntitlement(db, email, setId)
        console.info('[stripe] revoked', setId, 'from', email, 'via', stripeEvent.type)
      } else {
        // Worth a human look: the money moved but we could not match a row.
        console.error('[stripe] could not match refund/dispute to an entitlement', obj.id)
      }
      break
    }

    default:
      // Subscribed to more than we handle; acknowledging keeps Stripe from
      // retrying events we deliberately ignore.
      break
  }

  return { received: true }
})
