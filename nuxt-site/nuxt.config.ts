export default defineNuxtConfig({
  modules: ['@nuxt/ui', '@nuxt/content'],
  css: ['~/assets/css/main.css'],
  devtools: { enabled: true },
  ssr: true,
  app: {
    head: {
      titleTemplate: '%s | Cannons & Coastlines',
      htmlAttrs: { lang: 'en' },
      link: [
        { rel: 'icon', type: 'image/png', href: '/assets/images/icon.png' },
        { rel: 'apple-touch-icon', href: '/assets/images/icon.png' }
      ],
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1.0, viewport-fit=cover' }
      ]
    }
  },
  ui: {
    fonts: true,
    colorMode: false,
    theme: {
      colors: ['primary', 'secondary', 'neutral', 'success', 'warning', 'error'],
      defaultVariants: { color: 'primary', size: 'xl' }
    }
  },
  fonts: {
    families: [
      { name: 'Cinzel', provider: 'google', weights: [400, 600, 700] },
      { name: 'Inter', provider: 'google', weights: [400, 500, 600] }
    ]
  },
  compatibilityDate: '2026-05-04',
  nitro: {
    // Cloudflare Workers with Static Assets. Emits .output/server/index.mjs
    // (the Worker) and .output/public/ (everything served as a static asset).
    preset: 'cloudflare_module'
  },
  content: {
    // On Cloudflare Workers @nuxt/content needs a SQL backend. Bind a D1
    // database as `DB` in wrangler.jsonc; locally Nitro falls back to
    // better-sqlite3 so dev still works.
    database: {
      type: 'd1',
      bindingName: 'DB'
    }
  }
})
