// Who may download a paid set: shared by /api/download/<id> (the zip) and
// /api/download/<set>/<file> (one STL or 3MF, for opening in a slicer).

import type { H3Event } from 'h3'
import { findOrder, hasEntitlement, isOrderKey, useDb } from '~~/server/utils/entitlement'
import type { StlSet } from '~~/server/utils/sets'

// Constant-time, so response timing cannot be used to guess the secret a
// character at a time.
export function sameSecret(given: string, expected: string): boolean {
  const a = new TextEncoder().encode(given)
  const b = new TextEncoder().encode(expected)
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!
  return diff === 0
}

/** Does `?share=` match the PAID_SHARE_TOKEN secret (while it is set)? */
export function isShared(event: H3Event, share: unknown): boolean {
  const env = event.context.cloudflare?.env as Record<string, unknown> | undefined
  const token = typeof env?.PAID_SHARE_TOKEN === 'string' ? env.PAID_SHARE_TOKEN : ''
  return Boolean(token && typeof share === 'string' && share && sameSecret(share, token))
}

// The normal path: a paid order that includes every one of these sets, not
// reversed, and a live entitlement behind each. Throws on any failure.
// Deliberately no release check: taking a set off sale stops new sales, never
// downloads for people who bought it (access is perpetual; see
// server/utils/entitlement.ts). A set that was never released cannot have
// buyers, since checkout refuses it.
export async function requirePurchase(event: H3Event, required: StlSet[], orderKey: unknown) {
  if (!isOrderKey(orderKey)) {
    throw createError({ statusCode: 401, statusMessage: 'A download link is required' })
  }

  const db = await useDb(event)
  const order = await findOrder(db, orderKey)
  // email is filled in only once the order page or the webhook has seen the
  // payment confirmed by Stripe; before that the order grants nothing.
  if (!order || !order.email || order.revokedAt || !required.every(s => order.setIds.includes(s.id))) {
    throw createError({ statusCode: 403, statusMessage: 'Invalid download link' })
  }

  // The entitlement is what a refund or dispute revokes, so check it on every
  // download rather than trusting the order row alone.
  for (const set of required) {
    if (!(await hasEntitlement(db, order.email, set.id))) {
      throw createError({ statusCode: 403, statusMessage: 'No active purchase found for this set' })
    }
  }
}
