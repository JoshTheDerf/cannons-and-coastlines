// The tags a shop page needs to be posted as a link: on Instagram (a story
// link sticker, the bio, a DM), Facebook, iMessage, Discord and search.
//
// Crawlers don't run the page and don't resolve relative URLs, so everything
// here is absolute and on the canonical domain, whichever host served it:
//   - Open Graph title, description, URL and a 1200 × 630 JPEG
//     (assets/images/social/<handle>.jpg, `npx jake social-cards`). Meta
//     won't use WebP, which is what the fleet pictures are.
//   - og:type product with the price, Facebook's product tags.
//   - A schema.org Product with its Offer in JSON-LD, for Google.
//   - <link rel="canonical">, so ?utm_ and ?format= links count as one page.
//
// Instagram's product tags (Instagram Shopping) are a different thing: they
// need a Meta catalog, and Meta's commerce policy doesn't allow downloadable
// files in one, so these pages are shared as plain links.

/** Bump after `npx jake social-cards` so Instagram and Facebook refetch the pictures (they cache by URL). */
const SOCIAL_VERSION = '1'

export type ProductOffer = {
  /** USD. 0 for the free base-set files. */
  price: number
  available: boolean
}

export function useProductSeo(o: {
  /** The page's path, e.g. /shop/stone-fleet. */
  path: string
  /** assets/images/social/<social>.jpg */
  social: string
  title: string
  description: string
  imageAlt: string
  /** null while there's nothing to buy yet (no price to show). */
  offer: ProductOffer | null
  /** Product id for the JSON-LD (the set or bundle id). */
  sku: string
}) {
  const site = useRuntimeConfig().public.siteUrl
  const url = `${site}${o.path}`
  const image = `${site}/assets/images/social/${o.social}.jpg?v=${SOCIAL_VERSION}`
  const brand = 'Cannons & Coastlines'
  const price = o.offer ? o.offer.price.toFixed(2) : null

  useSeoMeta({
    title: o.title,
    description: o.description,
    ogType: 'product' as any,
    ogSiteName: brand,
    ogTitle: `${o.title} | ${brand}`,
    ogDescription: o.description,
    ogUrl: url,
    ogImage: image,
    ogImageSecureUrl: image,
    ogImageType: 'image/jpeg',
    ogImageWidth: 1200,
    ogImageHeight: 630,
    ogImageAlt: o.imageAlt,
    twitterCard: 'summary_large_image',
    twitterTitle: `${o.title} | ${brand}`,
    twitterDescription: o.description,
    twitterImage: image,
    twitterImageAlt: o.imageAlt
  })

  useHead({
    link: [{ rel: 'canonical', href: url }],
    meta: [
      { property: 'product:brand', content: brand },
      { property: 'product:retailer_item_id', content: o.sku },
      ...(o.offer
        ? [
            { property: 'product:price:amount', content: price! },
            { property: 'product:price:currency', content: 'USD' },
            { property: 'product:availability', content: o.offer.available ? 'in stock' : 'out of stock' },
            { property: 'product:condition', content: 'new' }
          ]
        : [])
    ],
    script: [{
      type: 'application/ld+json',
      // A string, so unhead writes it as-is instead of escaping it as text.
      innerHTML: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'Product',
        'name': o.title,
        'description': o.description,
        'image': [image],
        'url': url,
        'sku': o.sku,
        'brand': { '@type': 'Brand', 'name': brand },
        ...(o.offer
          ? {
              offers: {
                '@type': 'Offer',
                'url': url,
                'price': price,
                'priceCurrency': 'USD',
                'availability': o.offer.available ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
                'itemCondition': 'https://schema.org/NewCondition'
              }
            }
          : {})
      })
    }]
  })
}
