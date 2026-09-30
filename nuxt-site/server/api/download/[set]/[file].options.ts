// CORS preflight for /api/download/<set>/<file> (see server/utils/slicerCors.ts).
import { slicerPreflight } from '~~/server/utils/slicerCors'

export default defineEventHandler(slicerPreflight)
