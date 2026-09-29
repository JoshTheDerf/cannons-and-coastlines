// Stripe over plain fetch, and the one place an order is confirmed.
//
// No stripe SDK: it pulls in Node built-ins that need shimming on Workers,
// and everything here is a form-encoded request or a GET. Same reason the
// webhook verifies signatures with WebCrypto directly.

import type { H3Event } from 'h3'
import { grantEntitlement, markOrderPaid, type Order } from '~~/server/utils/entitlement'
import { findSet } from '~~/server/utils/sets'

export function stripeSecret(event: H3Event): string {
  const secret = (event.context.cloudflare?.env as Record<string, string> | undefined)?.STRIPE_SECRET_KEY
  if (!secret) {
    throw createError({ statusCode: 500, statusMessage: 'STRIPE_SECRET_KEY is not configured' })
  }
  return secret
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

  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
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

type Charge = { refunded: boolean, disputed: boolean }

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
 * Ask Stripe where an order stands and, if it is paid and not refunded,
 * record the purchase. Stripe is asked every time rather than trusting a
 * paid_at we stored earlier, so a refund or dispute shows up here even if the
 * webhook that should have revoked it never arrived.
 */
export async function confirmOrder(event: H3Event, db: D1Database, order: Order): Promise<{ state: OrderState, email: string | null }> {
  const session = await stripeApi<CheckoutSession>(
    event,
    `checkout/sessions/${encodeURIComponent(order.sessionId)}?expand[]=payment_intent.latest_charge`
  )

  if (session.status === 'expired') return { state: 'expired', email: null }

  // A session can complete before an asynchronous payment settles; only a
  // settled one counts. A 100% promotion code completes with nothing to pay.
  const settled = session.status === 'complete'
    && (session.payment_status === 'paid' || session.payment_status === 'no_payment_required')
  const email = session.customer_details?.email ?? null
  if (!settled || !email) return { state: 'pending', email: null }

  const charge = session.payment_intent?.latest_charge
  if (charge && (charge.refunded || charge.disputed)) return { state: 'refunded', email }

  await markOrderPaid(db, order.orderKey, email)
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
