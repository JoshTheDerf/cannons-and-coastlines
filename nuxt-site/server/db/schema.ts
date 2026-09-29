// Shop tables: who may download which paid STL set.
//
// They live in the same D1 database @nuxt/content uses (binding DB in
// wrangler.jsonc). @nuxt/content owns its own tables and creates them at
// runtime; the `cc_` prefix keeps ours clearly ours and out of its way.
//
// The Worker applies these itself, once per isolate, before its first query
// (useDb in server/utils/entitlement.ts). Every statement is IF NOT EXISTS, so
// re-running is harmless, and there is no separate migration step to forget
// on deploy. Add new tables and indexes here the same way; changing an
// existing column needs a real migration.

export const SCHEMA: string[] = [
  // One row per (buyer, set). Granted when a paid order is confirmed (the
  // order page or the Stripe webhook, whichever sees it first), read by the
  // download route.
  `CREATE TABLE IF NOT EXISTS cc_entitlements (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    -- Lowercased email from the Stripe Checkout Session. There are no site
    -- accounts; this is the identity a purchase is recorded against.
    email           TEXT    NOT NULL,
    set_id          TEXT    NOT NULL,
    -- Stripe ids kept for reconciliation and refunds.
    stripe_session  TEXT,
    stripe_payment  TEXT,
    amount_cents    INTEGER,
    created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
    -- Set when a purchase is refunded or disputed. Nullable rather than a
    -- boolean so the revocation date is kept for support questions.
    revoked_at      TEXT
  )`,

  // The download route's hot path, and idempotency for repeated grants.
  `CREATE UNIQUE INDEX IF NOT EXISTS cc_entitlements_email_set
    ON cc_entitlements (email, set_id)`,

  `CREATE INDEX IF NOT EXISTS cc_entitlements_email
    ON cc_entitlements (email)`,

  // Processed Stripe events, so a replayed or duplicated webhook is a no-op.
  // Stripe guarantees at-least-once delivery, never exactly-once.
  `CREATE TABLE IF NOT EXISTS cc_stripe_events (
    event_id     TEXT PRIMARY KEY,
    type         TEXT NOT NULL,
    processed_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,

  // One row per checkout. order_key is the buyer's download link
  // (/shop/order/<key>): 128 random bits, minted before the Stripe session so
  // it can go in the payment description, and so into Stripe's receipt
  // email. email is filled in once the payment is confirmed; until then the
  // order grants nothing.
  `CREATE TABLE IF NOT EXISTS cc_orders (
    order_key   TEXT PRIMARY KEY,
    session_id  TEXT NOT NULL,
    set_ids     TEXT NOT NULL,
    email       TEXT,
    paid_at     TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  )`,

  `CREATE INDEX IF NOT EXISTS cc_orders_session
    ON cc_orders (session_id)`
]
