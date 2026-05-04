// Mock Shopify Storefront data store.
// Internal shape only — Shopify-shaped output is produced in the GraphQL handler.

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
  title: string
  description: string
  faction: string
  tagline: string
  featuredImage: Image
  images: Image[]
  options: { id: string, name: string, values: string[] }[]
  variants: Variant[]
  includes: { icon: string, title: string, items: string[] }[]
  modelUrl: string
  // Bounding-box-relative positions in object space (0..1 per axis) for
  // accessory parts inserted into holes on the ship hull. Object-space
  // axes assumed: X = length (bow→stern), Y = beam (port↔starboard),
  // Z = vertical (keel→top); the viewer rotates the ship -90° on X so
  // model Z becomes world Y.
  placements: {
    type: 'mast' | 'cannon' | 'movement-wheel'
    position: [number, number, number]
    rotation?: [number, number, number]
    scale?: number
  }[]
  pairings: { with: string, title: string, blurb: string }[]
}

const usd = (n: number): Money => ({ amount: n.toFixed(2), currencyCode: 'USD' })

type ColorOption = { name: string, swatch: string }

const queensColors: ColorOption[] = [
  { name: 'Wood Brown', swatch: '#7a5230' },
  { name: 'Sky Blue',   swatch: '#7fb6d6' },
  { name: 'White',      swatch: '#f4f2ec' }
]

const corsairsColors: ColorOption[] = [
  { name: 'Pitch Black', swatch: '#1a1a1a' },
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

export const products: Product[] = [
  {
    id: 'gid://shopify/Product/queens-fleet',
    handle: 'queens-fleet-starter-set',
    title: "Queen's Fleet Starter Set",
    faction: "Queen's Fleet",
    tagline: 'Three larger ships of the line, sails, cannons, and coins.',
    description:
      "The Queen's Fleet sails on disciplined broadsides and heavy hulls. " +
      'This set includes everything you need to run the faction at the table, printed by hand at our home in Georgia.',
    featuredImage: {
      url: '/assets/photos/starter-pack/queens-fleet-ship-sm.jpg',
      altText: "Queen's Fleet ships printed in cream and tan"
    },
    images: [
      { url: '/assets/photos/starter-pack/queens-fleet-ship-sm.jpg', altText: "Queen's Fleet ships printed in cream and tan" },
      { url: '/assets/photos/queens-fleet-ship-of-the-line-hero-sm.jpg', altText: "Queen's Fleet ship of the line hero shot" },
      { url: '/assets/photos/queens-fleet-ship-of-the-line-sails-sm.jpg', altText: "Queen's Fleet ship with sails attached" },
      { url: '/rulebook/png/faction-card-queens-fleet.png', altText: "Queen's Fleet faction card" }
    ],
    options: [{ id: 'gid://shopify/ProductOption/queens-color', name: 'Color', values: queensColors.map(c => c.name) }],
    variants: buildVariants('queens', 65, queensColors),
    includes: [
      { icon: 'i-lucide-ship', title: 'Three ships of the line', items: [
        'Three large hulls with masts, sails, and flag holders',
        'Movement wheels and cargo bays for each ship',
        'A pack of cannons, cannonballs, and coins'
      ]},
      { icon: 'i-lucide-mountain', title: 'Coastline kit', items: [
        'Three island toppers and flagpoles',
        'Rocks and reefs for hazardous waters',
        "Faction card for the Queen's Fleet"
      ]},
      { icon: 'i-lucide-book-open', title: 'Printable manual', items: [
        'Latest edition of the rulebook (PDF)',
        'Faction reference card',
        "We'll send updates as the rules evolve"
      ]}
    ],
    modelUrl: '/assets/stls/cannons-and-coastlines-base-set-0.3/ship-queens-fleet.stl',
    placements: [
      { type: 'mast', position: [0.30, 0.50, 0.70] },
      { type: 'mast', position: [0.55, 0.50, 0.72] },
      { type: 'mast', position: [0.78, 0.50, 0.68] },
      { type: 'movement-wheel', position: [0.10, 0.50, 0.55] },
      { type: 'cannon', position: [0.40, 0.20, 0.55] },
      { type: 'cannon', position: [0.60, 0.20, 0.55] },
      { type: 'cannon', position: [0.40, 0.80, 0.55] },
      { type: 'cannon', position: [0.60, 0.80, 0.55] }
    ],
    pairings: [
      {
        with: 'corsair-fleet-starter-set',
        title: 'Pair with the Corsairs',
        blurb:
          'Grab one of each and you have a complete two-player game out of the box. Queens vs. Corsairs is the matchup we tune the rules around — heavy broadsides against quick raiders.'
      }
    ]
  },
  {
    id: 'gid://shopify/Product/corsairs',
    handle: 'corsair-fleet-starter-set',
    title: 'Corsair Fleet Starter Set',
    faction: 'Corsairs',
    tagline: 'Four small, fast ships built for raiding and boarding.',
    description:
      'The Corsairs win by being where the cannons are not. This set fields a four-ship raiding fleet, ' +
      'with everything you need to play the faction in a full game.',
    featuredImage: {
      url: '/assets/photos/starter-pack/corsair-ship-sm.jpg',
      altText: 'Corsair ships printed in dark filament'
    },
    images: [
      { url: '/assets/photos/starter-pack/corsair-ship-sm.jpg', altText: 'Corsair ships printed in dark filament' },
      { url: '/assets/photos/starter-pack/both-ships-and-background-sm.jpg', altText: 'Corsairs and Queen ships side by side' },
      { url: '/assets/photos/starter-pack/all-parts-sm.jpg', altText: 'All parts that ship in a starter pack' },
      { url: '/rulebook/png/faction-card-corsairs.png', altText: 'Corsairs faction card' }
    ],
    options: [{ id: 'gid://shopify/ProductOption/corsairs-color', name: 'Color', values: corsairsColors.map(c => c.name) }],
    variants: buildVariants('corsairs', 60, corsairsColors),
    includes: [
      { icon: 'i-lucide-ship', title: 'Four raiding ships', items: [
        'Four small hulls with masts, sails, and flag holders',
        'Movement wheels and cargo bays for each ship',
        'A pack of cannons, cannonballs, and coins'
      ]},
      { icon: 'i-lucide-mountain', title: 'Coastline kit', items: [
        'Three island toppers and flagpoles',
        'Rocks and reefs for hazardous waters',
        'Faction card for the Corsairs'
      ]},
      { icon: 'i-lucide-book-open', title: 'Printable manual', items: [
        'Latest edition of the rulebook (PDF)',
        'Faction reference card',
        "We'll send updates as the rules evolve"
      ]}
    ],
    modelUrl: '/assets/stls/cannons-and-coastlines-base-set-0.3/ship-corsair.stl',
    placements: [
      { type: 'mast', position: [0.50, 0.50, 0.70] },
      { type: 'movement-wheel', position: [0.18, 0.50, 0.55] },
      { type: 'cannon', position: [0.55, 0.20, 0.55] },
      { type: 'cannon', position: [0.55, 0.80, 0.55] }
    ],
    pairings: [
      {
        with: 'queens-fleet-starter-set',
        title: "Pair with the Queen's Fleet",
        blurb:
          'Two factions, two players, one full game. The Corsairs play very differently from the Queens — bringing both lets a new group jump straight into a head-to-head match.'
      }
    ]
  }
]

export type CartLine = { id: string, variantId: string, quantity: number }
export type Cart = { id: string, lines: CartLine[], createdAt: number, updatedAt: number }

const carts = new Map<string, Cart>()

const id = () => Math.random().toString(36).slice(2, 12)

export const findProduct = (handle: string) => products.find(p => p.handle === handle) ?? null
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
