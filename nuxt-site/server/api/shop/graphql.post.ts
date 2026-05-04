// Mock Shopify Storefront GraphQL endpoint.
//
// Dispatches on operation name (the client always names its operations) and
// returns Shopify-shaped data: { data, errors? }. Real swap-over: change the
// fetch URL to https://<shop>.myshopify.com/api/2025-01/graphql.json and add
// X-Shopify-Storefront-Access-Token. The query strings stay identical.

import {
  addLines, createCart, findProduct, getCart, products,
  removeLines, updateLines, type Cart, type Product, findVariant
} from '~~/server/utils/shopMock'

type Edges<T> = { edges: { node: T }[] }
const toEdges = <T,>(nodes: T[]): Edges<T> => ({ edges: nodes.map(node => ({ node })) })

function shapeProduct(p: Product, opts: { fullImages?: boolean } = {}) {
  return {
    id: p.id,
    handle: p.handle,
    title: p.title,
    description: p.description,
    descriptionHtml: `<p>${p.description}</p>`,
    featuredImage: p.featuredImage,
    images: toEdges(opts.fullImages ? p.images : [p.featuredImage]),
    options: p.options,
    priceRange: {
      minVariantPrice: p.variants[0]!.price,
      maxVariantPrice: p.variants[p.variants.length - 1]!.price
    },
    variants: toEdges(p.variants.map(v => ({
      id: v.id,
      title: v.title,
      availableForSale: v.available,
      price: v.price,
      selectedOptions: v.selectedOptions,
      // swatch lives in a metafield on real Shopify; we expose the same shape
      metafield: { namespace: 'cnc', key: 'swatch', value: v.swatch, type: 'single_line_text_field' }
    }))),
    metafields: [
      { namespace: 'cnc', key: 'faction', value: p.faction, type: 'single_line_text_field' },
      { namespace: 'cnc', key: 'tagline', value: p.tagline, type: 'single_line_text_field' },
      { namespace: 'cnc', key: 'includes', value: JSON.stringify(p.includes), type: 'json' },
      { namespace: 'cnc', key: 'model_url', value: p.modelUrl, type: 'file_reference' },
      { namespace: 'cnc', key: 'pairings', value: JSON.stringify(p.pairings), type: 'json' },
      { namespace: 'cnc', key: 'placements', value: JSON.stringify(p.placements), type: 'json' }
    ]
  }
}

function shapeCart(cart: Cart) {
  let subtotal = 0
  const lineNodes = cart.lines.map(line => {
    const found = findVariant(line.variantId)!
    const lineAmount = Number(found.variant.price.amount) * line.quantity
    subtotal += lineAmount
    return {
      id: line.id,
      quantity: line.quantity,
      cost: { totalAmount: { amount: lineAmount.toFixed(2), currencyCode: 'USD' as const } },
      merchandise: {
        __typename: 'ProductVariant',
        id: found.variant.id,
        title: found.variant.title,
        availableForSale: found.variant.available,
        price: found.variant.price,
        selectedOptions: found.variant.selectedOptions,
        product: {
          id: found.product.id,
          handle: found.product.handle,
          title: found.product.title,
          featuredImage: found.product.featuredImage
        },
        metafield: { namespace: 'cnc', key: 'swatch', value: found.variant.swatch, type: 'single_line_text_field' }
      }
    }
  })
  const total = { amount: subtotal.toFixed(2), currencyCode: 'USD' as const }
  return {
    id: cart.id,
    createdAt: new Date(cart.createdAt).toISOString(),
    updatedAt: new Date(cart.updatedAt).toISOString(),
    checkoutUrl: `/shop/checkout?cart=${encodeURIComponent(cart.id)}`,
    totalQuantity: cart.lines.reduce((n, l) => n + l.quantity, 0),
    lines: toEdges(lineNodes),
    cost: { subtotalAmount: total, totalAmount: total, totalTaxAmount: null }
  }
}

const ok = (data: unknown) => ({ data })
const userErrors = (msg: string) => [{ field: null as string[] | null, message: msg }]

export default defineEventHandler(async (event) => {
  const body = await readBody<{ query: string, variables?: Record<string, any>, operationName?: string }>(event)
  if (!body?.query) throw createError({ statusCode: 400, statusMessage: 'query required' })
  const variables = body.variables ?? {}
  const op = body.operationName ?? (body.query.match(/(?:query|mutation)\s+(\w+)/)?.[1] ?? '')

  switch (op) {
    case 'GetProducts': {
      const first = Number(variables.first ?? 20)
      return ok({ products: toEdges(products.slice(0, first).map(p => shapeProduct(p))) })
    }

    case 'GetProductByHandle': {
      const p = findProduct(String(variables.handle))
      return ok({ product: p ? shapeProduct(p, { fullImages: true }) : null })
    }

    case 'GetCart': {
      const c = getCart(String(variables.id))
      return ok({ cart: c ? shapeCart(c) : null })
    }

    case 'CartCreate': {
      const input = variables.input ?? {}
      const cart = createCart()
      if (Array.isArray(input.lines) && input.lines.length) {
        const updated = addLines(cart.id, input.lines)
        return ok({ cartCreate: { cart: updated ? shapeCart(updated) : null, userErrors: [] } })
      }
      return ok({ cartCreate: { cart: shapeCart(cart), userErrors: [] } })
    }

    case 'CartLinesAdd': {
      const updated = addLines(String(variables.cartId), variables.lines ?? [])
      return ok({ cartLinesAdd: updated
        ? { cart: shapeCart(updated), userErrors: [] }
        : { cart: null, userErrors: userErrors('Cart not found') } })
    }

    case 'CartLinesUpdate': {
      const updated = updateLines(String(variables.cartId), variables.lines ?? [])
      return ok({ cartLinesUpdate: updated
        ? { cart: shapeCart(updated), userErrors: [] }
        : { cart: null, userErrors: userErrors('Cart not found') } })
    }

    case 'CartLinesRemove': {
      const updated = removeLines(String(variables.cartId), variables.lineIds ?? [])
      return ok({ cartLinesRemove: updated
        ? { cart: shapeCart(updated), userErrors: [] }
        : { cart: null, userErrors: userErrors('Cart not found') } })
    }
  }

  return { data: null, errors: [{ message: `Unknown operation "${op}"` }] }
})
