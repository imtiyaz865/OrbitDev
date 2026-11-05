import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const STATIC_ROUTES = [
  { path: '/', changefreq: 'daily', priority: '1.0' },
  { path: '/events', changefreq: 'daily', priority: '0.9' },
  { path: '/community', changefreq: 'monthly', priority: '0.6' },
]
const SITEMAP_WEEKENDS = 8

function isoDate(date) {
  return date.toISOString().slice(0, 10)
}

/** Saturdays from this weekend onward, as YYYY-MM-DD pairs, in India time. */
function upcomingWeekends(count) {
  const india = new Date(Date.now() + 5.5 * 60 * 60 * 1000)
  const start = new Date(Date.UTC(india.getUTCFullYear(), india.getUTCMonth(), india.getUTCDate()))
  const day = start.getUTCDay()
  start.setUTCDate(start.getUTCDate() + (day === 0 ? -1 : 6 - day))
  return Array.from({ length: count }, (_, index) => {
    const saturday = new Date(start)
    saturday.setUTCDate(start.getUTCDate() + index * 7)
    const sunday = new Date(saturday)
    sunday.setUTCDate(saturday.getUTCDate() + 1)
    return [isoDate(saturday), isoDate(sunday)]
  })
}

/** Published upcoming event slugs via the existing public API. Never fails the build. */
async function upcomingEventSlugs(apiBase) {
  if (!/^https?:\/\//.test(apiBase)) return []
  const base = apiBase.replace(/\/+$/, '')
  const requests = upcomingWeekends(SITEMAP_WEEKENDS).map(async ([start, end]) => {
    const response = await fetch(`${base}/events/weekends?start=${start}&end=${end}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    })
    if (!response.ok) return []
    const payload = await response.json()
    const data = payload?.data ?? payload
    const events = Array.isArray(data) ? data : data?.events || []
    return events.map((event) => event?.slug).filter((slug) => typeof slug === 'string' && slug)
  })
  const results = await Promise.allSettled(requests)
  return [...new Set(results.flatMap((result) => (result.status === 'fulfilled' ? result.value : [])))]
}

function escapeXml(value) {
  return value.replace(/[<>&'"]/g, (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[char])
}

/**
 * Injects the canonical origin into index.html and emits robots.txt and
 * sitemap.xml at build time. Set VITE_SITE_URL (e.g. https://example.com).
 */
function orbitSeo(env) {
  const site = (env.VITE_SITE_URL || '').trim().replace(/\/+$/, '')
  const hasSite = /^https?:\/\//.test(site)
  return {
    name: 'orbit-seo',
    transformIndexHtml(html) {
      return html.replaceAll('%SITE_URL%', hasSite ? site : '')
    },
    async generateBundle() {
      const robots = [
        'User-agent: *',
        'Allow: /',
        'Disallow: /admin',
        'Disallow: /admin/',
        'Disallow: /reset-password',
        ...(hasSite ? ['', `Sitemap: ${site}/sitemap.xml`] : []),
        '',
      ].join('\n')
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: robots })

      if (!hasSite) {
        this.warn('VITE_SITE_URL is not set: sitemap.xml skipped and social image URLs stay relative.')
        return
      }
      let slugs = []
      try {
        slugs = await upcomingEventSlugs(env.VITE_API_BASE_URL || '')
      } catch {
        slugs = []
      }
      const entries = [
        ...STATIC_ROUTES.map((route) => `  <url><loc>${escapeXml(site + route.path)}</loc><changefreq>${route.changefreq}</changefreq><priority>${route.priority}</priority></url>`),
        ...slugs.map((slug) => `  <url><loc>${escapeXml(`${site}/events/${encodeURIComponent(slug)}`)}</loc><changefreq>weekly</changefreq><priority>0.7</priority></url>`),
      ]
      const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join('\n')}\n</urlset>\n`
      this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: sitemap })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), tailwindcss(), orbitSeo(env)],
    server: {
      port: 5173,
      proxy: {
        '/api': process.env.VITE_API_PROXY_TARGET || 'http://localhost:4000',
      },
    },
  }
})
