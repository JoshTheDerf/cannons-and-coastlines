// The seven fleets (shared/data/fleets.json), for the pages and the server.
// Auto-imported in the app; the server imports it from #shared/utils/fleets.

import data from '../data/fleets.json'

export type Fleet = {
  id: string
  name: string
  set: string
  group: 'base' | 'addon'
  summary: string
  image: string
  large: string
  hull: string
  stats: [string, string][]
  ability: string
  abilityBody: string
  card: string
  cardImage: string
}

export const FLEETS = data.fleets as Fleet[]

/** A fleet by id (shop handle), name or set id. A set id matches its first fleet. */
export const findFleet = (key: string): Fleet | null =>
  FLEETS.find(f => f.id === key || f.name === key || f.set === key) ?? null

/** The fleet's page: the one place with its full stats, ability and faction card. */
export const fleetPage = (f: Pick<Fleet, 'id'>) => `/shop/${f.id}`

function short([k, v]: [string, string]): string | null {
  if (k === 'Ships') return v
  if (k === 'Move Count') return `Move ${v}`
  if (k === 'Fittings') {
    const n = parseInt(v)
    return v.replace(/^\d+( each)?/, `${n} fitting${n === 1 ? '' : 's'}`)
  }
  return null
}

/** "3 frigates · 4 fittings · Move 3", for a one-line mention. */
export const statLine = (f: Fleet): string =>
  f.stats.map(short).filter(Boolean).join(' · ')
