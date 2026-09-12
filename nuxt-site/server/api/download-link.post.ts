// Mint a download link for a buyer.
//
//   POST /api/download-link  { setId, email }
//
// Deliberately does NOT return the token in the response. It is emailed to the
// address on the entitlement, which is what makes the email an identity check
// rather than a lookup key — otherwise anyone who guessed a customer's address
// could pull their files.
//
// The response is identical whether or not an entitlement exists, so this
// endpoint cannot be used to enumerate who bought what.

import { hasEntitlement, mintDownloadToken, normalizeEmail, TOKEN_TTL_MINUTES, useDb } from '~~/server/utils/entitlement'
import { findSet, isDownloadable } from '~~/server/utils/sets'

type Body = { setId?: string, email?: string }

const looksLikeEmail = (s: string): boolean => /^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(s)

export default defineEventHandler(async (event) => {
  const { setId, email } = await readBody<Body>(event)

  if (!setId || !email || !looksLikeEmail(email)) {
    throw createError({ statusCode: 400, statusMessage: 'setId and a valid email are required' })
  }

  const set = findSet(setId)
  if (!set || !set.paid) {
    throw createError({ statusCode: 404, statusMessage: 'Unknown set' })
  }
  if (!isDownloadable(set)) {
    throw createError({ statusCode: 409, statusMessage: `${set.title} is not released yet` })
  }

  const db = useDb(event)
  const address = normalizeEmail(email)

  if (await hasEntitlement(db, address, set.id)) {
    const token = await mintDownloadToken(db, address, set.id)
    const url = `${getRequestURL(event).origin}/api/download/${set.id}?token=${token}`

    // TODO: wire the transactional sender before the first paid set ships.
    // Cloudflare Email Sending is the natural fit here (same account as the
    // Worker); until it is bound, the link is logged so a manual send is
    // still possible and nothing silently drops on the floor.
    console.info('[download-link] send to', address, url)
  }

  // Same answer either way. Do not leak whether the address bought anything.
  return {
    ok: true,
    message: `If ${email} has purchased ${set.title}, a download link is on its way. It expires in ${TOKEN_TTL_MINUTES} minutes.`
  }
})
