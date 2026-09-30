// One download's print list: the fleets and parts on it, the zip and PDF,
// the CubbySlicer links and the "How to do it" steps. /print-guide uses it
// for the free base set and /print-list/<set> for everything else, and both
// render the tables with <PrintListBody>.
//
// The list is public (it only names parts). The zip is not: a paid set's
// link goes to /api/download/<id> with the ?order= key or ?share= token the
// page was opened with, and that route does the entitlement check.
//
// Words: content/pages/print-lists.yml and print-guide.yml, the same files
// rulebook/typst/print-list.typ renders into PRINTING.pdf. Keep colorOf()
// and qtyOf() in step with color-of() and qty-of() there.
import manifest from '~~/server/data/sets.json'
import platesData from '~~/shared/data/print-plates.json'

export type PrintPart = {
  part: string, file: string, files?: string[], each?: number, qty?: number | string, color: string
  base?: boolean, supports?: boolean, note?: string, render?: string
}
export type ListFleet = { id: string, set: string, ships: number, shipType: string, fittings: string, parts: PrintPart[] }
/** A fleet in print-guide.yml `fleets.items`. */
export type GuideFleet = {
  id: string, name: string, set: string, hull?: string, matchRigging?: boolean
  supports?: boolean, parts?: [string, string][]
}
type ColorRow = { id: string, part: string, color: string }
type SetEntry = { id: string, title: string, paid: boolean, version: string, freeDownloadUrl: string | null }
type BundleEntry = { id: string, title: string, zipBaseName: string, includes: { set: string, folder: string }[] }
type Plate = {
  fleet: string, file: string, set: string, paid: boolean, own: boolean
  color: string, label: string, swatch: string, plates: number
  parts: { part: string, qty: number, supports: boolean }[]
}

export const BASE_SET_ID = 'base-set'
/** Where a set's print list is. The base set's is the print guide. */
export const printListPath = (setId: string) => setId === BASE_SET_ID ? '/print-guide' : `/print-list/${setId}`

const SLICER = 'https://cubbycad.com/slicer/'
const RENDER_VERSION: Record<string, string> = {
  'mast': '?v=0.5', 'cannon': '?v=0.5', 'cargo': '?v=0.5', 'movement-wheel': '?v=0.5',
  'ship-queens-fleet': '?v=0.5', 'ship-corsair': '?v=0.5', 'ship-shadow-fleet': '?v=2',
  'cannonball': '?v=3', 'rock1': '?v=2', 'reef': '?v=2', 'sail-damaged': '?v=2',
  'sail-stone-fleet': '?v=2', 'sail-islanders': '?v=2'
}

export async function usePrintList(id: string) {
  // Both before the first await, which loses the Nuxt context in a composable.
  const route = useRoute()
  const origin = useRequestURL().origin
  const sets = manifest.sets as SetEntry[]
  const bundles = (manifest as { bundles?: BundleEntry[] }).bundles ?? []
  const set = sets.find(s => s.id === id) ?? null
  const bundle = set ? null : bundles.find(b => b.id === id) ?? null
  if (!set && !bundle) throw createError({ statusCode: 404, statusMessage: 'No print list for that set' })

  const [{ data: lists }, { data: guide }] = await Promise.all([
    useAsyncData('print-lists', () => queryCollection('pages').where('stem', '=', 'pages/print-lists').first()),
    useAsyncData('print-guide', () => queryCollection('pages').where('stem', '=', 'pages/print-guide').first())
  ])
  if (!lists.value || !guide.value) throw createError({ statusCode: 500, statusMessage: 'Print list content missing' })
  const L = lists.value as any
  const G = guide.value as any

  const setIds = bundle ? bundle.includes.map(i => i.set) : [id]
  const baseSetId: string = L.base.set
  const hasBase = setIds.includes(baseSetId)
  const guideFleets = G.fleets.items as GuideFleet[]
  const guideFleet = (fid: string) => guideFleets.find(f => f.id === fid)!
  const fleets = (L.fleets.items as ListFleet[]).filter(f => setIds.includes(f.set))
  const isPaid = (setId: string) => sets.find(s => s.id === setId)?.paid ?? false

  // The bundle's title as its PDF and PRINTING.md have it.
  const title: string = bundle ? L.bundle.title : guideFleets.filter(f => f.set === id).map(f => f.name).join(' and ')

  // ── Lookups (mirrors print-list.typ) ──────────────────────────────────
  function colorOf(key: string, fleet?: ListFleet): string {
    const gf = fleet ? guideFleet(fleet.id) : undefined
    if (gf?.hull && (key === 'hull' || (gf.matchRigging && (key === 'masts' || key === 'sails')))) return gf.hull
    return (G.colors.rows as ColorRow[]).find(r => r.id === key)?.color ?? key
  }
  const qtyOf = (p: PrintPart, fleet?: ListFleet) => p.each && fleet ? p.each * fleet.ships : p.qty
  const renderOf = (p: PrintPart) => {
    const stem = p.render ?? p.file.replace(/\.stl$/, '')
    return `/assets/images/renders/${stem}.png${RENDER_VERSION[stem] ?? ''}`
  }

  // ── The download ──────────────────────────────────────────────────────
  // Only the forms the download route accepts are passed on; anything else
  // is dropped rather than echoed into a link.
  const orderKey = typeof route.query.order === 'string' && /^[0-9a-f]{32}$/.test(route.query.order) ? route.query.order : null
  const share = typeof route.query.share === 'string' && /^[\w-]{8,128}$/.test(route.query.share) ? route.query.share : null
  const free = !!set && !set.paid
  const downloadUrl = free
    ? set!.freeDownloadUrl
    : orderKey ? `/api/download/${id}?order=${orderKey}`
      : share ? `/api/download/${id}?share=${encodeURIComponent(share)}`
        : null
  const shopHandle = set ? (free ? 'base-set-files' : guideFleets.find(f => f.set === id)?.id ?? null) : null
  const pdfUrl = `/rulebook/pdf/print-list-${id}.pdf`
  const versions = setIds.map((s) => {
    const e = sets.find(x => x.id === s)!
    return `${e.title} v${e.version}`
  }).join(' · ')

  // ── CubbySlicer ───────────────────────────────────────────────────────
  // https://cubbycad.com/slicer/?model=<url>[&model=<url>…]&name=<file>…&arrange=all fetches each file
  // and opens it (a project 3MF opens with its plates and settings). The
  // slicer fetches from its own origin: /assets/stls/* allow it in _headers,
  // and /api/download/<set>/<file> in server/utils/slicerCors.ts. Paid files
  // need the order key or share token the page was opened with, same as the
  // zip; without one only the free base-set files get a link.
  // Plates: scripts/print/build_print_plates.py (npx jake print-plates).
  const access = orderKey ? `?order=${orderKey}` : share ? `?share=${encodeURIComponent(share)}` : null
  // name: the file name (the paid route's path ends in it too, but the query
  // string follows). arrange=all: the slicer lays the parts out again for
  // whatever printer it has.
  const slicerUrl = (urls: string[]) => {
    const q = urls.map(u => `model=${encodeURIComponent(u)}`)
    q.push(...urls.map(u => `name=${encodeURIComponent(new URL(u).pathname.split('/').pop()!)}`))
    return `${SLICER}?${q.join('&')}&arrange=all`
  }
  // A file's URL for the slicer, or null when it's paid and there's no key.
  function modelUrl(file: string, fromSet: string): string | null {
    if (fromSet === baseSetId) return `${origin}/assets/stls/base-set/${file}`
    return access ? `${origin}/api/download/${fromSet}/${file}${access}` : null
  }
  function openPart(p: PrintPart, fleet?: ListFleet): string | null {
    const from = !fleet || p.base ? baseSetId : fleet.set
    const urls = (p.files ?? [p.file]).map(f => modelUrl(f, from))
    return urls.every(Boolean) ? slicerUrl(urls as string[]) : null
  }
  // "3 hulls", "6 masts and 3 cargo", "20 coins".
  function partsText(parts: Plate['parts']) {
    const one = (pt: Plate['parts'][number]) => {
      const name = pt.part.toLowerCase()
      return `${pt.qty} ${pt.qty === 1 || /s$|cargo$/.test(name) ? name : `${name}s`}`
    }
    const list = parts.map(one)
    const text = list.length > 1 ? `${list.slice(0, -1).join(', ')} and ${list.at(-1)}` : list[0]!
    return parts.some(pt => pt.supports) ? `${text}, with supports` : text
  }
  function platesFor(key: string) {
    return (platesData.groups as Plate[])
      // On the all-fleets list, the parts every fleet shares are in one set of plates at the end.
      .filter(g => g.fleet === key && (!bundle || g.own))
      .map((g) => {
        // A paid plate without the order key is listed, with no link.
        const url = !g.paid ? `${origin}/assets/stls/plates/${g.file}`
          : access ? `${origin}/api/download/${g.set}/${g.file}${access}` : null
        return {
          ...g,
          open: url ? slicerUrl([url]) : null,
          download: g.paid ? null : `/assets/stls/plates/${g.file}`,
          what: partsText(g.parts)
        }
      })
  }
  // One block per fleet (and the islands, coins and terrain, and on the
  // all-fleets list the shared parts), in page order.
  const plateSections = [
    ...fleets.map(f => ({ key: f.id, title: guideFleet(f.id).name, plates: platesFor(f.id) })),
    ...(hasBase ? [{ key: 'general', title: L.general.title as string, plates: platesFor('general') }] : []),
    ...(bundle ? [{ key: 'all-fleets', title: "Every fleet's masts, cargo, cannons and wheels", plates: platesFor('all-fleets') }] : [])
  ].filter(sec => sec.plates.length)

  // ── How to do it ──────────────────────────────────────────────────────
  // print-lists.yml `howTo`, with the links filled in. On /print-guide the
  // settings and assembly are further down the same page.
  const onGuide = id === baseSetId
  const fill = (s: string) => s
    .replaceAll('{zip}', downloadUrl ?? '')
    .replaceAll('{base}', '/print-guide')
    .replaceAll('{settings}', onGuide ? '#settings' : '/print-guide#settings')
    .replaceAll('{assembly}', onGuide ? '#assembly' : '/print-guide#assembly')
  const H = L.howTo
  const howTo: string[] = [
    downloadUrl ? H.get.web : H.buy.web,
    ...(hasBase ? [] : [H.base.web]),
    H.print.web,
    H.build.web
  ].map(fill)

  return {
    L, G, id, set, bundle, title, fleets, hasBase, baseSetId, guideFleet, isPaid,
    colorOf, qtyOf, renderOf, openPart, plateSections,
    orderKey, share, free, downloadUrl, shopHandle, pdfUrl, versions, howTo
  }
}

export type PrintList = Awaited<ReturnType<typeof usePrintList>>
