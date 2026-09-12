-- Entitlements: who may download which paid STL set.
--
-- Applied against the same D1 database @nuxt/content uses (binding DB in
-- wrangler.jsonc). @nuxt/content owns its own tables and creates them at
-- runtime; the `cc_` prefix here keeps our tables clearly ours and out of
-- its way.
--
-- Apply with:
--   npx wrangler d1 execute cannons-and-coastlines-content --remote \
--       --file nuxt-site/server/db/0001_entitlements.sql
-- Drop --remote to apply to the local dev database instead. The statements
-- are IF NOT EXISTS so re-running is harmless.

-- One row per (buyer, set). Granted by the Stripe webhook, read by the
-- download route.
CREATE TABLE IF NOT EXISTS cc_entitlements (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    -- Lowercased billing email from the Stripe Checkout Session. This is the
    -- identity: there are no site accounts, so proving access means proving
    -- control of this address (see server/utils/entitlement.ts).
    email           TEXT    NOT NULL,
    set_id          TEXT    NOT NULL,
    -- Stripe ids kept for reconciliation and refunds.
    stripe_session  TEXT,
    stripe_payment  TEXT,
    amount_cents    INTEGER,
    created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
    -- Set when a purchase is refunded or charged back. Nullable rather than a
    -- boolean so the revocation date is preserved for support questions.
    revoked_at      TEXT
);

-- The download route's hot path: "does this email hold this set, unrevoked".
-- Also enforces idempotency, which matters because Stripe retries webhooks
-- and will deliver the same event more than once.
CREATE UNIQUE INDEX IF NOT EXISTS cc_entitlements_email_set
    ON cc_entitlements (email, set_id);

-- Support lookups: "what did this person buy".
CREATE INDEX IF NOT EXISTS cc_entitlements_email
    ON cc_entitlements (email);

-- Processed Stripe events, so a replayed or duplicated webhook is a no-op.
-- Stripe guarantees at-least-once delivery, never exactly-once.
CREATE TABLE IF NOT EXISTS cc_stripe_events (
    event_id     TEXT PRIMARY KEY,
    type         TEXT NOT NULL,
    processed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Short-lived download links emailed to a buyer. Rows are disposable; a
-- cleanup pass may delete anything past expires_at.
CREATE TABLE IF NOT EXISTS cc_download_tokens (
    token      TEXT PRIMARY KEY,
    email      TEXT NOT NULL,
    set_id     TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    used_at    TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS cc_download_tokens_expires
    ON cc_download_tokens (expires_at);
