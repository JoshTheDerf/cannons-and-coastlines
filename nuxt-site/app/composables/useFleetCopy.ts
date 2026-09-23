// Fleet stats and abilities, as the home page already states them.
//
// content/pages/home.yml `fleets` is where these words live; the store reads
// them from there rather than keeping a second copy that would drift when a
// rules update changes a Move Count. Keyed by faction name, which is how the
// store's products (server/utils/shopMock.ts `faction`) refer to them.

export type FleetCopy = {
  /** "3 ships", "4 fittings each", ... ready to show as chips. */
  stats: string[]
  ability?: string
  abilityBody?: string
  body?: string
  card?: string
}

export function useFleetCopy() {
  return useAsyncData('fleet-copy', async () => {
    const home = await queryCollection('pages').where('stem', '=', 'pages/home').first()
    const fleets = (home as any)?.fleets ?? {}
    const out: Record<string, FleetCopy> = {}
    for (const f of fleets.base ?? []) {
      out[f.name] = {
        // Base fleets list stats as [label, value] pairs.
        stats: (f.stats ?? []).map(([k, v]: [string, string]) => `${k}: ${v}`),
        ability: f.ability,
        abilityBody: f.abilityBody,
        body: f.summary,
        card: f.card
      }
    }
    for (const f of fleets.addons ?? []) {
      out[f.name] = {
        // Add-on fleets have one "2 junks · 3 fittings · Move 2" line.
        stats: String(f.stats ?? '').split('·').map(s => s.trim()).filter(Boolean),
        body: f.body,
        card: f.card
      }
    }
    return out
  })
}
