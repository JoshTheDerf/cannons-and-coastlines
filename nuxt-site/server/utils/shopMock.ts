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
  /**
   * The digital set this faction's files come from, matching an id in
   * server/data/sets.json. The store page shows a Digital tab driven by that
   * manifest: free for the base set, priced (or Coming Soon) for the rest.
   */
  setId: string | null
  /**
   * Null when there is no printed box for this faction yet — the Physical tab
   * then says so instead of offering an empty variant picker.
   */
  modelUrl: string | null
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
    tagline: 'Three ships of the line, rigged and armed.',
    description:
      "Heavy hulls and disciplined broadsides. Everything you need to field the Queen's Fleet, printed by hand at our home in Georgia.",
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
    setId: 'base-set',
    modelUrl: '/assets/stls/base-set/ship-queens-fleet.stl',
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
          'Grab one of each and you have a complete two-player game out of the box. Queens vs. Corsairs (heavy broadsides against quick raiders) is the matchup we tune the rules around.'
      }
    ]
  },
  {
    id: 'gid://shopify/Product/corsairs',
    handle: 'corsair-fleet-starter-set',
    title: 'Corsair Fleet Starter Set',
    faction: 'Corsairs',
    tagline: 'Four fast sloops for raiding and boarding.',
    description:
      'The Corsairs win by being where the cannons are not. A four-ship raiding fleet with everything you need to play.',
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
    setId: 'base-set',
    modelUrl: '/assets/stls/base-set/ship-corsair.stl',
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
          'The Corsairs play very differently from the Queens, so bringing both lets a new group jump straight into a head-to-head game.'
      }
    ]
  },

  // ── Add-on factions ────────────────────────────────────────────────
  //
  // Digital-first: the files are sold as a download, and no printed box
  // exists for these yet. They still get a full store page — the Physical tab
  // says a box is not available rather than hiding the faction — so adding
  // one later means filling in `variants` and `options` here and nothing else.
  //
  // `variants: []` is what marks a product as having no physical offering.
  // modelUrl is null on purpose: the 3D previewer streams the STL from
  // /assets/stls/, and these hulls are deliberately not served there.
  ...addOnFactions()
]

/**
 * The five paid factions, which share a shape: no printed box, no color
 * variants, a digital set behind them. Written as a builder rather than five
 * near-identical literals so the differences stay visible.
 */
function addOnFactions(): Product[] {
  const specs: {
    handle: string, title: string, faction: string, setId: string
    tagline: string, description: string, image: string, card: string
    ships: string[]
  }[] = [
    {
      handle: 'treasure-fleet-files', title: 'Treasure Fleet', faction: 'Treasure Fleet',
      setId: 'treasure-fleet-set',
      tagline: 'Fewer ships with deeper holds.',
      description: 'Fewer ships, but double coins from every island you hold.',
      image: '/assets/ships/ship-preview-treasure-fleet-sm.webp',
      card: '/rulebook/pdf/faction-card-treasure-fleet.pdf',
      ships: ['Heavy treasure galleons', 'Faction-specific cargo fittings']
    },
    {
      handle: 'stone-fleet-files', title: 'Stone Fleet', faction: 'Stone Fleet',
      setId: 'stone-fleet-set',
      tagline: 'Carved stone, slow to break.',
      description: 'Carved stone ships. Slow, but each ship ignores the first hit it takes each turn.',
      image: '/assets/ships/ship-preview-stone-fleet-sm.webp',
      card: '/rulebook/pdf/faction-card-stone-fleet.pdf',
      ships: ['Carved stone hulls', 'Stone Fleet masts and fittings']
    },
    {
      handle: 'shadow-fleet-files', title: 'Shadow Fleet', faction: 'Shadow Fleet',
      setId: 'shadow-fleet-set',
      tagline: 'Fragile ships that keep coming back.',
      description: 'Thin hulls that sink easily and rise again from any island you hold.',
      image: '/assets/ships/ship-preview-shadow-fleet-sm.webp',
      card: '/rulebook/pdf/faction-card-shadow-fleet.pdf',
      ships: ['Ghost hulls', 'Shadow Fleet fittings']
    },
    {
      handle: 'industry-files', title: 'The Industry', faction: 'The Industry',
      setId: 'industry-set',
      tagline: 'Engine-driven warships with forward guns.',
      description: 'Engine-driven warships with a forward bow gun and a rotating turret.',
      image: '/assets/ships/ship-preview-industry-sm.webp',
      card: '/rulebook/pdf/faction-card-the-industry.pdf',
      ships: ['Ironclad hulls', 'Smokestacks and forward turrets']
    },
    {
      handle: 'islanders-files', title: 'The Islanders', faction: 'The Islanders',
      setId: 'islander-set',
      tagline: 'Fast catamarans with rear-firing guns.',
      description: 'Fast catamarans with a gun astern. Start the game already holding an island.',
      image: '/assets/ships/ship-preview-islanders-sm.webp',
      card: '/rulebook/pdf/faction-card-the-islanders.pdf',
      ships: ['Catamaran hulls', 'Islander fittings']
    }
  ]

  return specs.map(s => ({
    id: `gid://shopify/Product/${s.setId}`,
    handle: s.handle,
    title: s.title,
    faction: s.faction,
    tagline: s.tagline,
    description: s.description,
    featuredImage: { url: s.image, altText: `${s.title} ships` },
    images: [
      { url: s.image, altText: `${s.title} ships` },
      { url: s.card.replace('/pdf/', '/png/').replace('.pdf', '.png'), altText: `${s.title} faction card` }
    ],
    options: [],
    variants: [],
    includes: [
      { icon: 'i-lucide-ship', title: 'The hulls', items: s.ships },
      { icon: 'i-lucide-book-open', title: 'Faction card', items: [
        'Printable reference for this faction\'s rules',
        'Works with the free base set you already have'
      ] },
      { icon: 'i-lucide-refresh-cw', title: 'Free updates', items: [
        'Re-download whenever the models are revised'
      ] }
    ],
    setId: s.setId,
    modelUrl: null,
    placements: [],
    pairings: []
  }))
}

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
