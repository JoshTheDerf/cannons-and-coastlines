// Mock Shopify Storefront data store.
// Internal shape only — Shopify-shaped output is produced in the GraphQL handler.
//
// A fleet's name, summary, pictures and faction card come from
// shared/data/fleets.json (see fleet() below). This file owns only what is
// about selling it: kit contents, colors, prices and pairings.

import { findFleet, type Fleet } from '#shared/utils/fleets'

export type Money = { amount: string, currencyCode: 'USD' }

export type Variant = {
  id: string
  title: string                 // "Royal Blue"
  available: boolean
  price: Money
  swatch: string
  selectedOptions: { name: string, value: string }[]
}

export type Image = { url: string, altText: string }

export type Product = {
  id: string
  handle: string
  /** Old handles that should redirect here (links already shared). */
  aliases: string[]
  /** A faction's page sells its printed kit and its files; a download page only files. */
  kind: 'faction' | 'download'
  /** 'base' fleets come with the free game; 'addon' fleets are sold separately. */
  group: 'base' | 'addon'
  title: string
  description: string
  faction: string
  tagline: string
  featuredImage: Image
  images: Image[]
  options: { id: string, name: string, values: string[] }[]
  variants: Variant[]
  /**
   * Printed-kit state. 'available' needs variants; 'coming-soon' is a kit we
   * plan to box but have not priced, and 'none' is a page with no kit at all.
   */
  kitStatus: 'available' | 'coming-soon' | 'none'
  includes: { icon: string, title: string, items: string[] }[]
  /**
   * The digital set this page's files come from, matching an id in
   * server/data/sets.json: free for the base set, priced (or Coming Soon)
   * for the rest.
   */
  setId: string | null
  /**
   * Key into shared/data/ship-assemblies.json: the ship the 3D view builds.
   * Placements, parts and colors all live in that file.
   */
  assembly: string | null
  pairings: { with: string, title: string, blurb: string }[]
}

/**
 * Printed kits can't be ordered yet: the cart is this mock and checkout is a
 * stub page, not Shopify. While false, the base fleets' kits show as Coming
 * Soon (prices and colors stay here, ready). Flip to true once a real
 * checkout is wired, and uncomment the cart button in SiteNav.vue.
 */
const KITS_ON_SALE = false
const baseKitStatus: Product['kitStatus'] = KITS_ON_SALE ? 'available' : 'coming-soon'

const usd = (n: number): Money => ({ amount: n.toFixed(2), currencyCode: 'USD' })

type ColorOption = { name: string, swatch: string }

const queensColors: ColorOption[] = [
  { name: 'Wood Brown', swatch: '#7a5230' },
  { name: 'Sky Blue',   swatch: '#7fb6d6' },
  { name: 'White',      swatch: '#f4f2ec' }
]

const corsairsColors: ColorOption[] = [
  { name: 'Pitch Black', swatch: '#2c2c2c' },
  { name: 'Crimson Red', swatch: '#9a2a2a' },
  { name: 'Bone Grey',   swatch: '#c9c6bd' },
  { name: 'Wood Brown',  swatch: '#7a5230' }
]

const buildVariants = (
  productHandle: string,
  basePrice: number,
  palette: ColorOption[],
  soldOutColors: string[] = []
): Variant[] =>
  palette.map((c, i) => ({
    id: `gid://shopify/ProductVariant/${productHandle}-${i + 1}`,
    title: c.name,
    available: !soldOutColors.includes(c.name),
    price: usd(basePrice),
    swatch: c.swatch,
    selectedOptions: [{ name: 'Color', value: c.name }]
  }))

const fleet = (id: string): Fleet => {
  const f = findFleet(id)
  if (!f) throw new Error(`shared/data/fleets.json has no fleet ${id}`)
  return f
}
const cardImage = (f: Fleet): Image => ({ url: f.cardImage, altText: `${f.name} faction card` })

// Every printed kit ships the same terrain; the 3D view scatters the same
// pieces (shared/data/ship-assemblies.json `scene.terrain`).
const coastlineKit = (factionCard: string): Product['includes'][number] => ({
  icon: 'i-lucide-mountain', title: 'Coastline kit', items: [
    'Three island toppers with flagpoles',
    'Two rocks and two reefs',
    factionCard
  ]
})

const filesIncludes = (hull: string): Product['includes'][number] => ({
  icon: 'i-lucide-download', title: 'The STL files', items: [
    `${hull} and every faction-specific part`,
    'Print as many as you like, in any color',
    'Free re-downloads when the models change'
  ]
})

export const products: Product[] = [
  {
    id: 'gid://shopify/Product/queens-fleet',
    handle: 'queens-fleet',
    aliases: ['queens-fleet-starter-set'],
    kind: 'faction',
    group: 'base',
    title: fleet('queens-fleet').name,
    faction: fleet('queens-fleet').name,
    tagline: fleet('queens-fleet').summary,
    description:
      "The printed kit is everything you need to field the fleet, printed by hand at our home in Georgia. The files are free with the base game.",
    featuredImage: { url: fleet('queens-fleet').image, altText: "A Queen's Fleet frigate" },
    images: [
      { url: '/assets/photos/starter-pack/queens-fleet-ship-sm.jpg', altText: "Queen's Fleet ships printed in cream and tan" },
      { url: '/assets/photos/queens-fleet-ship-of-the-line-hero-sm.jpg', altText: "Queen's Fleet ship of the line" },
      { url: '/assets/photos/queens-fleet-ship-of-the-line-sails-sm.jpg', altText: "Queen's Fleet ship with sails attached" },
      cardImage(fleet('queens-fleet'))
    ],
    options: [{ id: 'gid://shopify/ProductOption/queens-color', name: 'Color', values: queensColors.map(c => c.name) }],
    variants: buildVariants('queens', 65, queensColors),
    kitStatus: baseKitStatus,
    includes: [
      { icon: 'i-lucide-ship', title: 'Three frigates', items: [
        'Three hulls with masts, sails and cargo fitted',
        'A movement wheel and rubber band for each ship',
        'Cannons, cannonballs and a set of coins'
      ] },
      coastlineKit("The Queen's Fleet faction card"),
      { icon: 'i-lucide-book-open', title: 'Printable manual', items: [
        'Latest edition of the rulebook (PDF)',
        "We'll send updates as the rules evolve"
      ] }
    ],
    setId: 'base-set',
    assembly: 'queens-fleet',
    pairings: [
      {
        with: 'corsairs',
        title: 'Pair with the Corsairs',
        blurb: "One of each is a complete two-player game. The frigates want a straight fight and the sloops would rather avoid one, and it's the matchup the rules are tuned around."
      },
      {
        with: 'shadow-fleet',
        title: 'Or face the Shadow Fleet',
        blurb: 'Thin hulls that sink easily and come back, against the heaviest broadsides in the game.'
      }
    ]
  },
  {
    id: 'gid://shopify/Product/corsairs',
    handle: 'corsairs',
    aliases: ['corsair-fleet-starter-set'],
    kind: 'faction',
    group: 'base',
    title: fleet('corsairs').name,
    faction: fleet('corsairs').name,
    tagline: fleet('corsairs').summary,
    description:
      'The printed kit is the whole fleet with everything you need to play, and the files are free with the base game.',
    featuredImage: { url: fleet('corsairs').image, altText: 'A Corsair sloop' },
    images: [
      { url: '/assets/photos/starter-pack/corsair-ship-sm.jpg', altText: 'Corsair ships printed in dark filament' },
      { url: '/assets/photos/starter-pack/both-ships-and-background-sm.jpg', altText: "Corsairs and Queen's Fleet ships side by side" },
      cardImage(fleet('corsairs'))
    ],
    options: [{ id: 'gid://shopify/ProductOption/corsairs-color', name: 'Color', values: corsairsColors.map(c => c.name) }],
    variants: buildVariants('corsairs', 60, corsairsColors),
    kitStatus: baseKitStatus,
    includes: [
      { icon: 'i-lucide-ship', title: 'Three sloops', items: [
        'Three hulls with masts, sails and cargo fitted',
        'A movement wheel and rubber band for each ship',
        'Cannons, cannonballs and a set of coins'
      ] },
      coastlineKit('The Corsairs faction card'),
      { icon: 'i-lucide-book-open', title: 'Printable manual', items: [
        'Latest edition of the rulebook (PDF)',
        "We'll send updates as the rules evolve"
      ] }
    ],
    setId: 'base-set',
    assembly: 'corsairs',
    pairings: [
      {
        with: 'queens-fleet',
        title: "Pair with the Queen's Fleet",
        blurb: "The two base fleets play very differently, so a new group can start straight away with a head-to-head game."
      }
    ]
  },
  {
    id: 'gid://shopify/Product/base-set-files',
    handle: 'base-set-files',
    aliases: [],
    kind: 'download',
    group: 'base',
    title: 'Base Set STL Files',
    faction: 'Free download',
    tagline: 'Both base fleets, plus terrain and coins. They\'re free.',
    description:
      "Everything in the base game as printable STL files: the Queen's Fleet and Corsair hulls, masts, sails, cargo, cannons, cannonballs, movement wheels, islands, rocks, reefs, the coin set and a fit test. Licensed CC BY-NC-SA.",
    featuredImage: { url: '/assets/photos/starter-pack/both-ships-and-background-sm.jpg', altText: 'Both base fleets on the table' },
    images: [
      { url: '/assets/photos/starter-pack/both-ships-and-background-sm.jpg', altText: 'Both base fleets on the table' },
      cardImage(fleet('queens-fleet')),
      cardImage(fleet('corsairs'))
    ],
    options: [],
    variants: [],
    kitStatus: 'none',
    includes: [
      { icon: 'i-lucide-ship', title: 'Two fleets', items: [
        "Queen's Fleet frigate and Corsair sloop hulls",
        'Masts, short masts, sails, cargo and barrels',
        'Cannons, cannonballs and movement wheels'
      ] },
      { icon: 'i-lucide-mountain', title: 'Terrain and coins', items: [
        'A freestanding island and an island topper',
        'Rocks and reefs',
        'All six coin types'
      ] },
      { icon: 'i-lucide-ruler', title: 'Print helpers', items: [
        'A fit test with every socket, to dial in tolerances',
        'Rulebook and faction cards (PDF)'
      ] }
    ],
    setId: 'base-set',
    assembly: 'queens-fleet',
    pairings: []
  },
  ...addOnFactions()
]

/**
 * The five add-on factions share a shape: files sold per set, and a printed
 * kit we mean to box but have not priced yet. Written as a builder rather
 * than five near-identical literals so the differences stay visible.
 */
function addOnFactions(): Product[] {
  const specs: {
    handle: string, alias: string, assembly: string
    kit: string[]
    pairings: Product['pairings']
  }[] = [
    {
      handle: 'treasure-fleet', alias: 'treasure-fleet-files', assembly: 'treasure-fleet',
      kit: ['Three junk hulls in silk gold', 'Treasure Fleet sails', 'Masts, cargo, cannons and wheels'],
      pairings: [{ with: 'industry', title: 'Pair with the Industry', blurb: 'Slow junks with a lot of coins to spend, against a turret that can reach them from any angle.' }]
    },
    {
      handle: 'stone-fleet', alias: 'stone-fleet-files', assembly: 'stone-fleet',
      kit: ['Three barge hulls in stone grey', 'Stone Fleet sails', 'Masts, barrels, cannons and wheels'],
      pairings: [{ with: 'islanders', title: 'Pair with the Islanders', blurb: 'Slow barges that shrug off the first hit, against five quick catamarans.' }]
    },
    {
      handle: 'shadow-fleet', alias: 'shadow-fleet-files', assembly: 'shadow-fleet',
      kit: ['Three galleon hulls in gradient PETG', 'Torn sails', 'Masts, cargo, cannons and wheels'],
      pairings: [{ with: 'queens-fleet', title: "Pair with the Queen's Fleet", blurb: 'Frigates with four fittings each take a while to sink. Your galleons sink faster, but they come back.' }]
    },
    {
      handle: 'industry', alias: 'industry-files', assembly: 'industry',
      kit: ['Three ironclad hulls in rust', 'Turrets and smokestacks', 'Cargo, cannons and wheels'],
      pairings: [{ with: 'treasure-fleet', title: 'Pair with the Treasure Fleet', blurb: 'Slow junks sitting on their islands are an easy target for a turret, if you can get past the coins they spend.' }]
    },
    {
      handle: 'islanders', alias: 'islanders-files', assembly: 'islanders',
      kit: ['Five catamaran hulls in pine', 'Islander sails on short masts', 'Cannons and wheels'],
      pairings: [{ with: 'stone-fleet', title: 'Pair with the Stone Fleet', blurb: "Quick catamarans against slow barges that don't break easily." }]
    }
  ]

  return specs.map((s) => {
    const f = fleet(s.handle)
    return {
    id: `gid://shopify/Product/${f.set}`,
    handle: s.handle,
    aliases: [s.alias],
    kind: 'faction' as const,
    group: 'addon' as const,
    title: f.name,
    faction: f.name,
    tagline: f.summary,
    description: `${f.summary} ${f.ability}: ${f.abilityBody}`,
    featuredImage: { url: f.image, altText: `A ${f.name} ship` },
    images: [
      { url: f.large, altText: `A ${f.name} ship` },
      cardImage(f)
    ],
    options: [],
    variants: [],
    kitStatus: 'coming-soon' as const,
    includes: [
      { icon: 'i-lucide-package', title: 'Printed kit', items: s.kit },
      coastlineKit(`The ${f.name} faction card`),
      filesIncludes(`${f.name} hulls`)
    ],
    setId: f.set,
    assembly: s.assembly,
    pairings: s.pairings
    }
  })
}

export type CartLine = { id: string, variantId: string, quantity: number }
export type Cart = { id: string, lines: CartLine[], createdAt: number, updatedAt: number }

const carts = new Map<string, Cart>()

const id = () => Math.random().toString(36).slice(2, 12)

export const findProduct = (handle: string) =>
  products.find(p => p.handle === handle || p.aliases.includes(handle)) ?? null
export const findVariant = (variantId: string) => {
  for (const p of products) {
    const v = p.variants.find(x => x.id === variantId)
    if (v) return { product: p, variant: v }
  }
  return null
}

export function createCart(): Cart {
  const cart: Cart = { id: `gid://shopify/Cart/${id()}`, lines: [], createdAt: Date.now(), updatedAt: Date.now() }
  carts.set(cart.id, cart)
  return cart
}

export const getCart = (cartId: string) => carts.get(cartId) ?? null

export function addLines(cartId: string, lines: { merchandiseId: string, quantity?: number }[]) {
  const cart = carts.get(cartId); if (!cart) return null
  for (const l of lines) {
    if (!findVariant(l.merchandiseId)) continue
    const existing = cart.lines.find(x => x.variantId === l.merchandiseId)
    if (existing) existing.quantity += l.quantity ?? 1
    else cart.lines.push({ id: `gid://shopify/CartLine/${id()}`, variantId: l.merchandiseId, quantity: l.quantity ?? 1 })
  }
  cart.updatedAt = Date.now()
  return cart
}

export function updateLines(cartId: string, lines: { id: string, quantity: number }[]) {
  const cart = carts.get(cartId); if (!cart) return null
  for (const l of lines) {
    const line = cart.lines.find(x => x.id === l.id); if (!line) continue
    if (l.quantity <= 0) cart.lines = cart.lines.filter(x => x.id !== l.id)
    else line.quantity = l.quantity
  }
  cart.updatedAt = Date.now()
  return cart
}

export function removeLines(cartId: string, lineIds: string[]) {
  const cart = carts.get(cartId); if (!cart) return null
  cart.lines = cart.lines.filter(l => !lineIds.includes(l.id))
  cart.updatedAt = Date.now()
  return cart
}
