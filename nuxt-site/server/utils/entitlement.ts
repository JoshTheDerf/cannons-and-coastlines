// Entitlements and orders.
//
// Identity model: there are no site accounts. A checkout mints an order key,
// a 128-bit random value that becomes the buyer's download link
// (/shop/order/<key>). Stripe redirects there after payment and prints it in
// the receipt email (it is the payment's description), so the link is what a
// buyer holds. Once Stripe confirms the payment, each set in the order becomes
// a row in cc_entitlements keyed by the buyer's email, and the download route
// serves a set only while that row is live, so a refund or dispute (which the
// webhook turns into revoked_at) shuts the link off.
//
// Tables live in server/db/schema.ts.

import type { H3Event } from 'h3'
import { SCHEMA } from '~~/server/db/schema'

// Applied once per isolate. A failed attempt is forgotten so the next request
// tries again instead of every request failing on a cached rejection.
let schemaReady: Promise<unknown> | null = null

/**
 * The D1 binding, from the Cloudflare env, with the shop tables in place.
 * Nitro's cloudflare_module preset exposes bindings on
 * event.context.cloudflare.env.
 */
export async function useDb(event: H3Event): Promise<D1Database> {
  const db = (event.context.cloudflare?.env as Record<string, unknown> | undefined)?.DB as D1Database | undefined
  if (!db) {
    // Fail loudly: silently treating a missing binding as "no entitlement"
    // would look identical to a legitimate denial and hide a broken deploy.
    throw createError({ statusCode: 500, statusMessage: 'D1 binding DB is not configured' })
  }
  schemaReady ??= db.batch(SCHEMA.map(sql => db.prepare(sql))).catch((e) => {
    schemaReady = null
    throw e
  })
  await schemaReady
  return db
}

/** Emails are compared case-insensitively; store and query one canonical form. */
export const normalizeEmail = (email: string): string => email.trim().toLowerCase()

/** Does this address hold a live (unrevoked) entitlement to this set? */
export async function hasEntitlement(db: D1Database, email: string, setId: string): Promise<boolean> {
  const row = await db
    .prepare('SELECT 1 FROM cc_entitlements WHERE email = ? AND set_id = ? AND revoked_at IS NULL LIMIT 1')
    .bind(normalizeEmail(email), setId)
    .first()
  return row !== null
}

/**
 * Record a purchase. Idempotent: the order page and the webhook both call it
 * for the same payment, and the unique index on (email, set_id) turns the
 * second call into an update. A repeat purchase of a previously refunded set
 * clears revoked_at, which is why this upserts instead of ignoring conflicts;
 * callers must therefore only call it for a payment Stripe says is paid and
 * not refunded.
 */
export async function grantEntitlement(db: D1Database, opts: {
  email: string
  setId: string
  stripeSession?: string
  stripePayment?: string
  amountCents?: number
}): Promise<void> {
  await db
    .prepare(`
      INSERT INTO cc_entitlements (email, set_id, stripe_session, stripe_payment, amount_cents)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT (email, set_id) DO UPDATE SET
        revoked_at     = NULL,
        stripe_session = excluded.stripe_session,
        stripe_payment = excluded.stripe_payment,
        amount_cents   = excluded.amount_cents
    `)
    .bind(
      normalizeEmail(opts.email),
      opts.setId,
      opts.stripeSession ?? null,
      opts.stripePayment ?? null,
      opts.amountCents ?? null
    )
    .run()
}

/** Revoke on refund or dispute. Keeps the row for the audit trail. */
export async function revokeEntitlement(db: D1Database, email: string, setId: string): Promise<void> {
  await db
    .prepare("UPDATE cc_entitlements SET revoked_at = datetime('now') WHERE email = ? AND set_id = ?")
    .bind(normalizeEmail(email), setId)
    .run()
}

/**
 * Remember an event id before acting on it. Returns false if it was already
 * processed, so the caller can skip the work. Relies on the PRIMARY KEY
 * conflict rather than a SELECT-then-INSERT, which would race against Stripe's
 * concurrent retries.
 */
export async function claimStripeEvent(db: D1Database, eventId: string, type: string): Promise<boolean> {
  const res = await db
    .prepare('INSERT OR IGNORE INTO cc_stripe_events (event_id, type) VALUES (?, ?)')
    .bind(eventId, type)
    .run()
  return (res.meta?.changes ?? 0) > 0
}

// ── Orders ──────────────────────────────────────────────────────────────

export type Order = {
  orderKey: string
  sessionId: string
  setIds: string[]
  email: string | null
  paidAt: string | null
}

/**
 * A fresh order key: 128 bits from the CSPRNG, hex. It is a bearer
 * credential (the download link), so it must not be derived from anything
 * guessable.
 */
export function newOrderKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return [...bytes].map(b => b.toString(16).padStart(2, '0')).join('')
}

export const isOrderKey = (s: unknown): s is string => typeof s === 'string' && /^[0-9a-f]{32}$/.test(s)

export async function createOrder(db: D1Database, orderKey: string, sessionId: string, setIds: string[]): Promise<void> {
  await db
    .prepare('INSERT INTO cc_orders (order_key, session_id, set_ids) VALUES (?, ?, ?)')
    .bind(orderKey, sessionId, setIds.join(','))
    .run()
}

type OrderRow = { order_key: string, session_id: string, set_ids: string, email: string | null, paid_at: string | null }

const toOrder = (row: OrderRow): Order => ({
  orderKey: row.order_key,
  sessionId: row.session_id,
  setIds: row.set_ids.split(',').filter(Boolean),
  email: row.email,
  paidAt: row.paid_at
})

export async function findOrder(db: D1Database, orderKey: string): Promise<Order | null> {
  const row = await db
    .prepare('SELECT order_key, session_id, set_ids, email, paid_at FROM cc_orders WHERE order_key = ?')
    .bind(orderKey)
    .first<OrderRow>()
  return row ? toOrder(row) : null
}

/** Mark an order paid and record who paid. Safe to call more than once. */
export async function markOrderPaid(db: D1Database, orderKey: string, email: string): Promise<void> {
  await db
    .prepare("UPDATE cc_orders SET email = ?, paid_at = COALESCE(paid_at, datetime('now')) WHERE order_key = ?")
    .bind(normalizeEmail(email), orderKey)
    .run()
}
