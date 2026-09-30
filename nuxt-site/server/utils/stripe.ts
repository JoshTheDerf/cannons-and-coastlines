// Stripe over plain fetch, and the one place an order is confirmed.
//
// No stripe SDK: it pulls in Node built-ins that need shimming on Workers,
// and everything here is a form-encoded request or a GET. Same reason the
// webhook verifies signatures with WebCrypto directly.

import type { H3Event } from 'h3'
import {
  grantEntitlement, markOrderPaid, normalizeEmail, restoreOrder, revokeOrder, type Order
} from '~~/server/utils/entitlement'
import { findSet } from '~~/server/utils/sets'

export function stripeSecret(event: H3Event): string {
  const secret = (event.context.cloudflare?.env as Record<string, string> | undefined)?.STRIPE_SECRET_KEY
  if (!secret) {
    throw createError({ statusCode: 500, statusMessage: 'STRIPE_SECRET_KEY is not configured' })
  }
  return secret
}

/**
 * Where Stripe's API is. STRIPE_API_BASE (a .dev.vars entry) points local
 * testing at a mock Stripe; only a localhost URL is honored, so a stray
 * production value can't send the secret key anywhere else.
 */
function stripeBase(event: H3Event): string {
  const base = (event.context.cloudflare?.env as Record<string, string> | undefined)?.STRIPE_API_BASE
  return base && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(base) ? base : 'https://api.stripe.com'
}

/**
 * Call the Stripe API. A form body makes it a POST. Stripe's error bodies can
 * name the account and its objects, so they are logged here and the caller
 * gets a generic 502.
 */
export async function stripeApi<T>(
  event: H3Event,
  path: string,
  opts: { form?: URLSearchParams, idempotencyKey?: string } = {}
): Promise<T> {
  const headers: Record<string, string> = { Authorization: `Bearer ${stripeSecret(event)}` }
  if (opts.form) headers['Content-Type'] = 'application/x-www-form-urlencoded'
  if (opts.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey

  const res = await fetch(`${stripeBase(event)}/v1/${path}`, {
    method: opts.form ? 'POST' : 'GET',
    headers,
    body: opts.form
  })
  if (!res.ok) {
    console.error('[stripe]', path.split('?')[0], res.status, await res.text())
    throw createError({ statusCode: 502, statusMessage: 'Payment provider error' })
  }
  return res.json<T>()
}

type Dispute = { status: string }
type Charge = { refunded: boolean, dispute: Dispute | string | null }

type CheckoutSession = {
  id: string
  status: 'open' | 'complete' | 'expired'
  payment_status: 'paid' | 'unpaid' | 'no_payment_required'
  amount_total: number | null
  customer_details: { email: string | null } | null
  payment_intent: { id: string, latest_charge: Charge | null } | null
}

export type OrderState = 'paid' | 'pending' | 'expired' | 'refunded'

/**
 * Has this payment been reversed? A full refund, or a dispute that has not
 * gone our way. A won dispute (or a closed inquiry) leaves the sale standing,
 * which is why this reads the dispute's status rather than charge.disputed,
 * which stays true forever once a dispute was opened.
 */
export function isReversed(charge: Charge | null | undefined): boolean {
  if (!charge) return false
  if (charge.refunded) return true
  const dispute = charge.dispute
  if (!dispute) return false
  const status = typeof dispute === 'string' ? 'unknown' : dispute.status
  return status !== 'won' && status !== 'warning_closed'
}

/**
 * Ask Stripe where an order stands and bring our records in line: grant its
 * sets if it is paid and stands, revoke them if the payment was reversed.
 * Stripe is asked every time, so a refund or a won dispute shows up here even
 * if the webhook that should have carried it never arrived.
 *
 * Once an order has been paid, a buyer must never be locked out because
 * Stripe is unreachable: if the call fails, our own record answers.
 */
export async function confirmOrder(event: H3Event, db: D1Database, order: Order): Promise<{ state: OrderState, email: string | null }> {
  let session: CheckoutSession
  try {
    session = await stripeApi<CheckoutSession>(
      event,
      `checkout/sessions/${encodeURIComponent(order.sessionId)}?expand[]=payment_intent.latest_charge.dispute`
    )
  } catch (e) {
    if (order.paidAt && order.email) {
      console.warn('[stripe] session lookup failed, answering from our records', order.orderKey)
      return { state: order.revokedAt ? 'refunded' : 'paid', email: order.email }
    }
    throw e
  }

  if (session.status === 'expired') return { state: 'expired', email: null }

  // A session can complete before an asynchronous payment settles; only a
  // settled one counts. A 100% promotion code completes with nothing to pay.
  const settled = session.status === 'complete'
    && (session.payment_status === 'paid' || session.payment_status === 'no_payment_required')
  const email = session.customer_details?.email ?? null
  if (!settled || !email) return { state: 'pending', email: null }

  await markOrderPaid(db, order.orderKey, email)
  const paid: Order = { ...order, email: normalizeEmail(email), paidAt: order.paidAt ?? 'now' }

  if (isReversed(session.payment_intent?.latest_charge)) {
    await revokeOrder(db, paid, 'refund or dispute')
    return { state: 'refunded', email }
  }

  if (order.revokedAt) await restoreOrder(db, order.orderKey)
  for (const setId of order.setIds) {
    if (!findSet(setId)) continue
    await grantEntitlement(db, {
      email,
      setId,
      stripeSession: session.id,
      stripePayment: session.payment_intent?.id,
      // Per-set share of what was actually charged, discounts included.
      amountCents: session.amount_total === null ? undefined : Math.round(session.amount_total / order.setIds.length)
    })
  }
  return { state: 'paid', email }
}
