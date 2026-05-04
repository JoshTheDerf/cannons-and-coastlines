// Storefront client + reactive cart state.
//
// Uses the official @shopify/storefront-api-client. For the demo we point its
// `customFetchApi` at our mock GraphQL endpoint at /api/shop/graphql so
// nothing real is required to run. To go live, drop `customFetchApi` and fill
// in the real `storeDomain` + `publicAccessToken`. The queries below are
// already valid Storefront API queries.

import { createStorefrontApiClient } from '@shopify/storefront-api-client'

const MOCK_ENDPOINT = '/api/shop/graphql'

const client = createStorefrontApiClient({
  storeDomain: 'https://mock.myshopify.com',
  apiVersion: '2026-04',
  publicAccessToken: 'mock-public-token',
  // Demo-only: route every request to our local mock GraphQL endpoint.
  // Uses Nuxt's $fetch so relative URLs resolve during SSR. Remove this
  // option in production to hit the real Shopify Storefront API.
  customFetchApi: async (_url, init) => {
    const body = await $fetch<unknown>(MOCK_ENDPOINT, {
      method: 'POST',
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body
    })
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    })
  }
})

const PRODUCT_FRAGMENT = /* GraphQL */ `
  fragment ProductCard on Product {
    id
    handle
    title
    description
    featuredImage { url altText }
    priceRange {
      minVariantPrice { amount currencyCode }
      maxVariantPrice { amount currencyCode }
    }
    options { id name values }
    variants(first: 25) {
      edges {
        node {
          id
          title
          availableForSale
          price { amount currencyCode }
          selectedOptions { name value }
          metafield(namespace: "cnc", key: "swatch") { value }
        }
      }
    }
    metafields(identifiers: [
      { namespace: "cnc", key: "faction" },
      { namespace: "cnc", key: "tagline" },
      { namespace: "cnc", key: "includes" },
      { namespace: "cnc", key: "model_url" },
      { namespace: "cnc", key: "pairings" },
      { namespace: "cnc", key: "placements" }
    ]) { namespace key value type }
  }
`

const GET_PRODUCTS = /* GraphQL */ `
  ${PRODUCT_FRAGMENT}
  query GetProducts($first: Int!) {
    products(first: $first) { edges { node { ...ProductCard } } }
  }
`

const GET_PRODUCT_BY_HANDLE = /* GraphQL */ `
  ${PRODUCT_FRAGMENT}
  query GetProductByHandle($handle: String!) {
    product(handle: $handle) {
      ...ProductCard
      descriptionHtml
      images(first: 10) { edges { node { url altText } } }
    }
  }
`

const CART_FRAGMENT = /* GraphQL */ `
  fragment CartFields on Cart {
    id
    checkoutUrl
    totalQuantity
    cost {
      subtotalAmount { amount currencyCode }
      totalAmount    { amount currencyCode }
    }
    lines(first: 50) {
      edges {
        node {
          id
          quantity
          cost { totalAmount { amount currencyCode } }
          merchandise {
            ... on ProductVariant {
              id
              title
              price { amount currencyCode }
              selectedOptions { name value }
              metafield(namespace: "cnc", key: "swatch") { value }
              product { handle title featuredImage { url altText } }
            }
          }
        }
      }
    }
  }
`

const GET_CART       = /* GraphQL */ `${CART_FRAGMENT} query GetCart($id: ID!) { cart(id: $id) { ...CartFields } }`
const CART_CREATE    = /* GraphQL */ `${CART_FRAGMENT} mutation CartCreate($input: CartInput!) { cartCreate(input: $input) { cart { ...CartFields } userErrors { field message } } }`
const CART_LINES_ADD = /* GraphQL */ `${CART_FRAGMENT} mutation CartLinesAdd($cartId: ID!, $lines: [CartLineInput!]!) { cartLinesAdd(cartId: $cartId, lines: $lines) { cart { ...CartFields } userErrors { field message } } }`
const CART_LINES_UPD = /* GraphQL */ `${CART_FRAGMENT} mutation CartLinesUpdate($cartId: ID!, $lines: [CartLineUpdateInput!]!) { cartLinesUpdate(cartId: $cartId, lines: $lines) { cart { ...CartFields } userErrors { field message } } }`
const CART_LINES_RM  = /* GraphQL */ `${CART_FRAGMENT} mutation CartLinesRemove($cartId: ID!, $lineIds: [ID!]!) { cartLinesRemove(cartId: $cartId, lineIds: $lineIds) { cart { ...CartFields } userErrors { field message } } }`

async function request<T>(query: string, variables: Record<string, any> = {}): Promise<T> {
  const { data, errors } = await client.request<T>(query, { variables })
  if (errors) {
    const msg = (errors.graphQLErrors ?? []).map(e => e.message).join('; ') || errors.message
    throw new Error(msg || 'Storefront request failed')
  }
  if (!data) throw new Error('No data returned from Storefront API')
  return data
}

// ------- Public types -------

export type ShopMoney = { amount: string, currencyCode: string }

export type ShopVariant = {
  id: string
  title: string
  availableForSale: boolean
  price: ShopMoney
  selectedOptions: { name: string, value: string }[]
  swatch: string
}

export type ShopProductCard = {
  id: string
  handle: string
  title: string
  description: string
  featuredImage: { url: string, altText: string }
  priceRange: { minVariantPrice: ShopMoney, maxVariantPrice: ShopMoney }
  variants: ShopVariant[]
  options: { id: string, name: string, values: string[] }[]
  faction: string
  tagline: string
  includes: { icon: string, title: string, items: string[] }[]
  modelUrl: string | null
  pairings: { with: string, title: string, blurb: string }[]
  placements: ShipPlacement[]
}

export type ShipPlacement = {
  type: 'mast' | 'cannon' | 'movement-wheel'
  position: [number, number, number]
  rotation?: [number, number, number]
  scale?: number
}

export type ShopProductDetail = ShopProductCard & {
  descriptionHtml: string
  images: { url: string, altText: string }[]
}

export type ShopCartLine = {
  id: string
  quantity: number
  lineTotal: ShopMoney
  variant: { id: string, title: string, swatch: string, price: ShopMoney }
  product: { handle: string, title: string, image: { url: string, altText: string } }
}

export type ShopCart = {
  id: string
  checkoutUrl: string
  totalQuantity: number
  subtotal: ShopMoney
  lines: ShopCartLine[]
}

// ------- Mappers (Storefront shape -> page shape) -------

const flattenVariant = (n: any): ShopVariant => ({
  id: n.id,
  title: n.title,
  availableForSale: n.availableForSale,
  price: n.price,
  selectedOptions: n.selectedOptions,
  swatch: n.metafield?.value ?? '#666'
})

const flattenMeta = (mfs: { key: string, value: string }[] = []) => {
  const get = (k: string) => mfs.find(m => m?.key === k)?.value
  return {
    faction: get('faction') ?? '',
    tagline: get('tagline') ?? '',
    modelUrl: get('model_url') ?? null,
    includes: (() => { try { return JSON.parse(get('includes') ?? '[]') } catch { return [] } })(),
    pairings: (() => { try { return JSON.parse(get('pairings') ?? '[]') } catch { return [] } })(),
    placements: (() => { try { return JSON.parse(get('placements') ?? '[]') } catch { return [] } })()
  }
}

const flattenCard = (node: any): ShopProductCard => {
  const meta = flattenMeta(node.metafields)
  return {
    id: node.id,
    handle: node.handle,
    title: node.title,
    description: node.description,
    featuredImage: node.featuredImage,
    priceRange: node.priceRange,
    options: node.options,
    variants: node.variants.edges.map((e: any) => flattenVariant(e.node)),
    faction: meta.faction,
    tagline: meta.tagline,
    includes: meta.includes,
    modelUrl: meta.modelUrl,
    pairings: meta.pairings,
    placements: meta.placements
  }
}

const flattenDetail = (node: any): ShopProductDetail => ({
  ...flattenCard(node),
  descriptionHtml: node.descriptionHtml,
  images: node.images.edges.map((e: any) => e.node)
})

const flattenCart = (cart: any): ShopCart => ({
  id: cart.id,
  checkoutUrl: cart.checkoutUrl,
  totalQuantity: cart.totalQuantity,
  subtotal: cart.cost.subtotalAmount,
  lines: cart.lines.edges.map((e: any) => {
    const m = e.node.merchandise
    return {
      id: e.node.id,
      quantity: e.node.quantity,
      lineTotal: e.node.cost.totalAmount,
      variant: { id: m.id, title: m.title, swatch: m.metafield?.value ?? '#666', price: m.price },
      product: { handle: m.product.handle, title: m.product.title, image: m.product.featuredImage }
    }
  })
})

const CART_KEY = 'cnc.cartId'

export function useShop() {
  const cart = useState<ShopCart | null>('cnc-cart', () => null)

  async function listProducts(): Promise<ShopProductCard[]> {
    const data = await request<{ products: { edges: { node: any }[] } }>(GET_PRODUCTS, { first: 20 })
    return data.products.edges.map(e => flattenCard(e.node))
  }

  async function getProduct(handle: string): Promise<ShopProductDetail | null> {
    const data = await request<{ product: any | null }>(GET_PRODUCT_BY_HANDLE, { handle })
    return data.product ? flattenDetail(data.product) : null
  }

  async function loadCart(): Promise<ShopCart | null> {
    if (!import.meta.client) return null
    const id = window.localStorage.getItem(CART_KEY)
    if (!id) return null
    const data = await request<{ cart: any | null }>(GET_CART, { id })
    if (!data.cart) {
      window.localStorage.removeItem(CART_KEY)
      cart.value = null
      return null
    }
    cart.value = flattenCart(data.cart)
    return cart.value
  }

  async function ensureCart(): Promise<ShopCart> {
    if (cart.value) return cart.value
    const loaded = await loadCart()
    if (loaded) return loaded
    const data = await request<{ cartCreate: { cart: any, userErrors: any[] } }>(CART_CREATE, { input: {} })
    cart.value = flattenCart(data.cartCreate.cart)
    if (import.meta.client) window.localStorage.setItem(CART_KEY, cart.value.id)
    return cart.value
  }

  async function addToCart(variantId: string, quantity = 1) {
    const current = await ensureCart()
    const data = await request<{ cartLinesAdd: { cart: any } }>(CART_LINES_ADD, {
      cartId: current.id,
      lines: [{ merchandiseId: variantId, quantity }]
    })
    cart.value = flattenCart(data.cartLinesAdd.cart)
    return cart.value
  }

  async function updateQuantity(lineId: string, quantity: number) {
    if (!cart.value) return
    const data = await request<{ cartLinesUpdate: { cart: any } }>(CART_LINES_UPD, {
      cartId: cart.value.id,
      lines: [{ id: lineId, quantity }]
    })
    cart.value = flattenCart(data.cartLinesUpdate.cart)
  }

  async function removeLine(lineId: string) {
    if (!cart.value) return
    const data = await request<{ cartLinesRemove: { cart: any } }>(CART_LINES_RM, {
      cartId: cart.value.id,
      lineIds: [lineId]
    })
    cart.value = flattenCart(data.cartLinesRemove.cart)
  }

  return { cart, listProducts, getProduct, loadCart, ensureCart, addToCart, updateQuantity, removeLine }
}
