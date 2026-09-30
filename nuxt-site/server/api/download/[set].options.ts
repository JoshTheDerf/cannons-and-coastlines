// CORS preflight for /api/download/<id> (see server/utils/slicerCors.ts).
import { slicerPreflight } from '~~/server/utils/slicerCors'

export default defineEventHandler(slicerPreflight)
