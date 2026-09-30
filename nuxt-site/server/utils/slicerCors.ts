// CORS for CubbySlicer. The print list opens files with
// https://cubbycad.com/slicer/?model=<url>, and the slicer fetches <url> from
// its own origin, so the download routes let that one origin read them.
// Only that origin: the gated routes never answer with `*`.

import type { H3Event } from 'h3'

export const SLICER_ORIGIN = 'https://cubbycad.com'

export function allowSlicer(event: H3Event) {
  setHeaders(event, { 'Access-Control-Allow-Origin': SLICER_ORIGIN, 'Vary': 'Origin' })
}

/** Preflight. A plain GET doesn't need one, but answer it if a browser asks. */
export function slicerPreflight(event: H3Event) {
  allowSlicer(event)
  setHeaders(event, {
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Max-Age': '86400'
  })
  setResponseStatus(event, 204)
  return ''
}
