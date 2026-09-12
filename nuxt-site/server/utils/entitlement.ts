// Entitlement checks and download-token minting.
//
// Identity model: there are no site accounts. The thing a buyer proves is
// control of the email address they paid with. So a purchase grants a row in
// cc_entitlements keyed by email, and the buyer reaches their files through a
// signed, expiring token minted for that (email, set) pair — never by simply
// typing an email into a form, which would let anyone guess their way in.
//
// Tables live in server/db/0001_entitlements.sql.

import type { H3Event } from 'h3'

/** Minutes a minted download token stays valid. */
export const TOKEN_TTL_MINUTES = 30

/**
 * The D1 binding, from the Cloudflare env. Nitro's cloudflare_module preset
 * exposes bindings on event.context.cloudflare.env.
 */
export function useDb(event: H3Event): D1Database {
  const db = (event.context.cloudflare?.env as Record<string, unknown> | undefined)?.DB
  if (!db) {
    // Fail loudly: silently treating a missing binding as "no entitlement"
    // would look identical to a legitimate denial and hide a broken deploy.
    throw createError({ statusCode: 500, statusMessage: 'D1 binding DB is not configured' })
  }
  return db as D1Database
}

/** Emails are compared case-insensitively; store and query one canonical form. */
export const normalizeEmail = (email: string): string => email.trim().toLowerCase()

/** Does this address hold a live (unrevoked) entitlement to this set? */
export async function hasEntitlement(db: D1Database, email: string, setId: string): Promise<boolean> {
  const row = await db
    .prepare('SELECT 1 FROM cc_entitlements WHERE email = ? AND set_id = ? AND revoked_at IS NULL LIMIT 1')
    .bind(normalizeEmail(email), setId)
    .first<{ 1: number }>()
  return row !== null
}

/**
 * Record a purchase. Idempotent: Stripe retries webhooks, and the unique index
 * on (email, set_id) turns a duplicate delivery into a no-op rather than a
 * second row. A repeat purchase of a previously refunded set clears
 * revoked_at, which is why this upserts instead of ignoring conflicts.
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

/** Revoke on refund or chargeback. Keeps the row for the audit trail. */
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

/**
 * Mint a single-use, expiring token for a set the buyer owns. The token is
 * 256 bits from the CSPRNG: it is a bearer credential, so it must not be
 * derived from the email or anything else guessable.
 */
export async function mintDownloadToken(db: D1Database, email: string, setId: string): Promise<string> {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  const token = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('')
  await db
    .prepare(`
      INSERT INTO cc_download_tokens (token, email, set_id, expires_at)
      VALUES (?, ?, ?, datetime('now', ?))
    `)
    .bind(token, normalizeEmail(email), setId, `+${TOKEN_TTL_MINUTES} minutes`)
    .run()
  return token
}

export type TokenCheck =
  | { ok: true, email: string, setId: string }
  | { ok: false, reason: 'unknown' | 'expired' | 'used' }

/**
 * Validate and consume a download token. Marks it used in the same statement
 * that checks it so two concurrent requests cannot both succeed.
 */
export async function consumeDownloadToken(db: D1Database, token: string): Promise<TokenCheck> {
  const row = await db
    .prepare('SELECT email, set_id, expires_at, used_at FROM cc_download_tokens WHERE token = ?')
    .bind(token)
    .first<{ email: string, set_id: string, expires_at: string, used_at: string | null }>()

  if (!row) return { ok: false, reason: 'unknown' }
  if (row.used_at) return { ok: false, reason: 'used' }

  const res = await db
    .prepare("UPDATE cc_download_tokens SET used_at = datetime('now') WHERE token = ? AND used_at IS NULL AND expires_at > datetime('now')")
    .bind(token)
    .run()

  if ((res.meta?.changes ?? 0) === 0) {
    // Lost the race, or the clock passed expires_at between the two queries.
    return { ok: false, reason: row.expires_at <= new Date().toISOString() ? 'expired' : 'used' }
  }
  return { ok: true, email: row.email, setId: row.set_id }
}
