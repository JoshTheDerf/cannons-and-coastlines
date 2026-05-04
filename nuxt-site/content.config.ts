import { defineCollection, defineContentConfig, z } from '@nuxt/content'

export default defineContentConfig({
  collections: {
    site: defineCollection({
      type: 'data',
      source: 'site.yml',
      schema: z.object({
        brand: z.object({ name: z.string(), tagline: z.string(), logo: z.string(), icon: z.string() }),
        nav: z.array(z.object({ label: z.string(), to: z.string(), external: z.boolean().optional() })),
        cta: z.object({ label: z.string(), to: z.string(), icon: z.string() }),
        announce: z.object({
          pill: z.string(),
          headline: z.string(),
          extra: z.string().optional(),
          cta: z.string(),
          to: z.string()
        }).optional(),
        footer: z.object({
          blurb: z.string(),
          columns: z.array(z.object({
            title: z.string(),
            links: z.array(z.object({
              label: z.string(),
              to: z.string(),
              external: z.boolean().optional()
            }))
          })),
          social: z.array(z.object({ label: z.string(), to: z.string(), icon: z.string() })),
          license: z.string(),
          licenseUrl: z.string()
        })
      })
    }),
    pages: defineCollection({
      type: 'data',
      source: 'pages/*.yml',
      schema: z.object({
        meta: z.object({ title: z.string(), description: z.string() }).optional(),
        hero: z.record(z.any()).optional(),
        nameVote: z.record(z.any()).optional(),
        seeIt: z.record(z.any()).optional(),
        howItPlays: z.record(z.any()).optional(),
        factions: z.record(z.any()).optional(),
        signup: z.record(z.any()).optional(),
        downloads: z.record(z.any()).optional(),
        about: z.record(z.any()).optional(),
        story: z.record(z.any()).optional(),
        contents: z.record(z.any()).optional(),
        form: z.record(z.any()).optional(),
        donate: z.record(z.any()).optional(),
        gallery: z.record(z.any()).optional(),
        assembly: z.record(z.any()).optional(),
        settings: z.record(z.any()).optional(),
        quantities: z.record(z.any()).optional(),
        cta: z.record(z.any()).optional()
      })
    }),
    prose: defineCollection({
      type: 'page',
      source: 'prose/**/*.md'
    })
  }
})
