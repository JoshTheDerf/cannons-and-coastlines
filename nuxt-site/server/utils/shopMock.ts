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

const card = (slug: string) => `/rulebook/png/faction-card-${slug}.png`

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
    title: "Queen's Fleet",
    faction: "Queen's Fleet",
    tagline: "Three well-armed frigates from the Crown's navy. It's the easiest fleet to learn.",
    description:
      "Heavy hulls and disciplined broadsides. The Queen has sent ships to the islands before, and some of them never came back. The printed kit is everything you need to field the fleet, printed by hand at our home in Georgia. The files are free with the base game.",
    featuredImage: { url: '/assets/ships/ship-preview-queen-fleet-large-sm.webp?v=0.5', altText: "A Queen's Fleet frigate" },
    images: [
      { url: '/assets/photos/starter-pack/queens-fleet-ship-sm.jpg', altText: "Queen's Fleet ships printed in cream and tan" },
      { url: '/assets/photos/queens-fleet-ship-of-the-line-hero-sm.jpg', altText: "Queen's Fleet ship of the line" },
      { url: '/assets/photos/queens-fleet-ship-of-the-line-sails-sm.jpg', altText: "Queen's Fleet ship with sails attached" },
      { url: card('queens-fleet'), altText: "Queen's Fleet faction card" }
    ],
    options: [{ id: 'gid://shopify/ProductOption/queens-color', name: 'Color', values: queensColors.map(c => c.name) }],
    variants: buildVariants('queens', 65, queensColors),
    kitStatus: 'available',
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
        blurb: "One of each is a complete two-player game. The Crown's frigates want a straight fight and the raiders would rather avoid one, which is the matchup we tune the rules around."
      },
      {
        with: 'shadow-fleet',
        title: 'Or face the Shadow Fleet',
        blurb: "The Queen's first ships to the islands disappeared without a trace. Something is sailing them again, and they're still flying her colors."
      }
    ]
  },
  {
    id: 'gid://shopify/Product/corsairs',
    handle: 'corsairs',
    aliases: ['corsair-fleet-starter-set'],
    kind: 'faction',
    group: 'base',
    title: 'Corsairs',
    faction: 'Corsairs',
    tagline: 'Three fast sloops for raiding and boarding.',
    description:
      'The Corsairs do best when they pick their fights and stay out of the way of the big guns. The printed kit is a full raiding fleet with everything you need to play, and the files are free with the base game.',
    featuredImage: { url: '/assets/ships/ship-preview-corsairs-sm.webp?v=0.5', altText: 'A Corsair sloop' },
    images: [
      { url: '/assets/photos/starter-pack/corsair-ship-sm.jpg', altText: 'Corsair ships printed in dark filament' },
      { url: '/assets/photos/starter-pack/both-ships-and-background-sm.jpg', altText: "Corsairs and Queen's Fleet ships side by side" },
      { url: card('corsairs'), altText: 'Corsairs faction card' }
    ],
    options: [{ id: 'gid://shopify/ProductOption/corsairs-color', name: 'Color', values: corsairsColors.map(c => c.name) }],
    variants: buildVariants('corsairs', 60, corsairsColors),
    kitStatus: 'available',
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
        blurb: 'The Corsairs play very differently from the Queens, so bringing both lets a new group jump straight into a head-to-head game.'
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
      { url: card('queens-fleet'), altText: "Queen's Fleet faction card" },
      { url: card('corsairs'), altText: 'Corsairs faction card' }
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
    handle: string, alias: string, title: string, setId: string, assembly: string, cardSlug: string
    tagline: string, description: string, image: string, large: string
    kit: string[]
    pairings: Product['pairings']
  }[] = [
    {
      handle: 'treasure-fleet', alias: 'treasure-fleet-files', title: 'Treasure Fleet',
      setId: 'treasure-fleet-set', assembly: 'treasure-fleet', cardSlug: 'treasure-fleet',
      tagline: 'Two gilded junks from an empire far to the north.',
      description: "They're here to collect tribute and gold, and they'll leave you alone if you return the favor. They bring fewer ships than anyone else at the table, but every island they hold pays out double.",
      image: '/assets/ships/ship-preview-treasure-fleet-sm.webp',
      large: '/assets/ships/ship-preview-treasure-fleet-large.png',
      kit: ['Two junk hulls in silk gold', 'Treasure Fleet sails', 'Masts, cargo, cannons and wheels'],
      pairings: [{ with: 'industry', title: 'Pair with The Industry', blurb: "The Industry would rather not pay tribute to anyone, and the Treasure Fleet would rather not have to ask twice." }]
    },
    {
      handle: 'stone-fleet', alias: 'stone-fleet-files', title: 'Stone Fleet',
      setId: 'stone-fleet-set', assembly: 'stone-fleet', cardSlug: 'stone-fleet',
      tagline: 'Carved stone barges. Slow, and very hard to sink.',
      description: "They're descended from the losing side of an old uprising, who fled to a distant, rocky continent and built a harder people there. Stone was what they had, so they used it for pretty much everything, ships included. Each ship ignores the first hit it takes every turn.",
      image: '/assets/ships/ship-preview-stone-fleet-sm.webp',
      large: '/assets/ships/ship-preview-stone-fleet-large.png',
      kit: ['Three barge hulls in stone grey', 'Stone Fleet sails', 'Masts, barrels, cannons and wheels'],
      pairings: [{ with: 'islanders', title: 'Pair with The Islanders', blurb: "The Stone Fleet's ancestors left the islands a long time ago, and not on good terms. The Islanders still remember why." }]
    },
    {
      handle: 'shadow-fleet', alias: 'shadow-fleet-files', title: 'Shadow Fleet',
      setId: 'shadow-fleet-set', assembly: 'shadow-fleet', cardSlug: 'shadow-fleet',
      tagline: 'Galleons that sank in the first rush for the islands, and came back.',
      description: "Nobody knows what happened to them, or what's crewing them now. They're printed in translucent gradient PETG. The hulls are thin and sink easily, but they rise again at any island you hold.",
      image: '/assets/ships/ship-preview-shadow-fleet-sm.webp?v=2',
      large: '/assets/ships/ship-preview-shadow-fleet-large.png?v=2',
      kit: ['Three galleon hulls in gradient PETG', 'Torn sails', 'Masts, cargo, cannons and wheels'],
      pairings: [{ with: 'queens-fleet', title: "Pair with the Queen's Fleet", blurb: "They were the Queen's ships once, and she'd very much like them back." }]
    },
    {
      handle: 'industry', alias: 'industry-files', title: 'The Industry',
      setId: 'industry-set', assembly: 'industry', cardSlug: 'the-industry',
      tagline: 'Iron steamships from a colony that won its independence.',
      description: "They broke away from the Queen's empire and kept their freedom by out-building it. They're on reasonably civil terms with the Crown now, mostly. Each ship has a bow gun and a turret that fires in any direction (until it gets shot off).",
      image: '/assets/ships/ship-preview-industry-sm.webp',
      large: '/assets/ships/ship-preview-industry-large.png',
      kit: ['Three ironclad hulls in rust', 'Turrets and smokestacks', 'Cargo, cannons and wheels'],
      pairings: [{ with: 'treasure-fleet', title: 'Pair with the Treasure Fleet', blurb: "A young nation with a lot of new guns, and an old empire that just wants to be paid. Neither of them is looking for a war, which doesn't always stop one." }]
    },
    {
      handle: 'islanders', alias: 'islanders-files', title: 'The Islanders',
      setId: 'islander-set', assembly: 'islanders', cardSlug: 'the-islanders',
      tagline: 'Fast catamarans, sailed by the people who live on the islands.',
      description: "They know these waters better than anyone else, and they start the game already holding an island. The boats are quick and fragile, with their guns at the back.",
      image: '/assets/ships/ship-preview-islanders-sm.webp',
      large: '/assets/ships/ship-preview-islanders-large.png',
      kit: ['Five catamaran hulls in pine', 'Islander sails on short masts', 'Cannons and wheels'],
      pairings: [{ with: 'stone-fleet', title: 'Pair with the Stone Fleet', blurb: "The Islanders against the descendants of the people who once tried to rule them. Quick catamarans take on slow barges that won't break." }]
    }
  ]

  return specs.map(s => ({
    id: `gid://shopify/Product/${s.setId}`,
    handle: s.handle,
    aliases: [s.alias],
    kind: 'faction' as const,
    group: 'addon' as const,
    title: s.title,
    faction: s.title,
    tagline: s.tagline,
    description: s.description,
    featuredImage: { url: s.image, altText: `A ${s.title} ship` },
    images: [
      { url: s.large, altText: `A ${s.title} ship` },
      { url: card(s.cardSlug), altText: `${s.title} faction card` }
    ],
    options: [],
    variants: [],
    kitStatus: 'coming-soon' as const,
    includes: [
      { icon: 'i-lucide-package', title: 'Printed kit', items: s.kit },
      coastlineKit(`The ${s.title} faction card`),
      filesIncludes(`${s.title} hulls`)
    ],
    setId: s.setId,
    assembly: s.assembly,
    pairings: s.pairings
  }))
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
