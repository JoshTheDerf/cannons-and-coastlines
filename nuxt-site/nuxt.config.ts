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
        { rel: 'icon', type: 'image/png', href: '/assets/images/logo.png' },
        { rel: 'apple-touch-icon', href: '/assets/images/logo.png' }
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
      { name: 'Inter', provider: 'google', weights: [400, 500, 600] },
      { name: 'Crimson Pro', provider: 'google', weights: [400, 500, 600], styles: ['normal', 'italic'] }
    ]
  },
  compatibilityDate: '2026-05-04',
  nitro: {
    // Cloudflare Workers with Static Assets. Emits .output/server/index.mjs
    // (the Worker) and .output/public/ (everything served as a static asset).
    preset: 'cloudflare_module'
  },
  routeRules: {
    // Framable in an <iframe> on thederf.com, whose pages are served with
    // Cross-Origin-Embedder-Policy: credentialless (the uapp editor needs
    // SharedArrayBuffer, so that origin is cross-origin isolated). Two checks
    // apply to a frame inside such a page, and this site is on another origin,
    // so it needs both headers:
    //   COEP - inherited by every nested document; a frame without it is
    //          blocked ("CoepFrameResourceNeedsCoepHeader").
    //   CORP - COEP defaults Cross-Origin-Resource-Policy to same-origin, so a
    //          cross-origin frame is otherwise still refused as
    //          "CorpNotSameOriginAfterDefaultedToSameOriginByCoep".
    // Set here rather than in a `_headers` file because this site is SSR: the
    // HTML comes from the Worker and never goes through static-asset headers.
    // Cost: this becomes a credentialless context, so ITS cross-origin no-cors
    // subresources load without credentials. Google Fonts (the only such
    // dependency) is unaffected.
    '/**': {
      headers: {
        'Cross-Origin-Embedder-Policy': 'credentialless',
        'Cross-Origin-Resource-Policy': 'cross-origin'
      }
    },
    // COEP cuts both ways: a page that sends it may only frame documents
    // that also send it, and YouTube, Instagram, Google Forms and Kit do
    // not, so on any such page every embed fails with "refused to connect".
    // These pages carry third-party embeds, so they opt back out. They can
    // no longer be framed by a COEP page like thederf.com; everything else
    // on the site still can.
    '/': { headers: { 'Cross-Origin-Embedder-Policy': 'unsafe-none' } },
    '/live': { headers: { 'Cross-Origin-Embedder-Policy': 'unsafe-none' } },
    '/starter-pack': { headers: { 'Cross-Origin-Embedder-Policy': 'unsafe-none' } }
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
