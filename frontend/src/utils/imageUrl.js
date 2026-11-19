/** Returns an http(s) image URL without credentials, or null. */
export function safeImageUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return null
  try {
    const url = new URL(value.trim())
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : null
  } catch {
    return null
  }
}

const LUMA_HOST = 'images.lumacdn.com'
const LUMA_PREFIX = '/cdn-cgi/image/'

/**
 * Asks an image CDN for a smaller rendition of the same image when the URL
 * carries resize options. Luma event URLs request 1920×1920 by default; a card or
 * thumbnail only needs a fraction of that. The crop and aspect ratio are kept
 * (height scales with width). Any other URL is returned unchanged.
 */
export function sizedImageUrl(value, width) {
  const src = safeImageUrl(value)
  if (!src || !Number.isFinite(width) || width <= 0) return src
  const url = new URL(src)
  if (url.hostname !== LUMA_HOST || !url.pathname.startsWith(LUMA_PREFIX)) return src
  const rest = url.pathname.slice(LUMA_PREFIX.length)
  const slash = rest.indexOf('/')
  if (slash <= 0) return src
  const options = rest.slice(0, slash).split(',').map((pair) => pair.split('='))
  const current = Object.fromEntries(options)
  const currentWidth = Number(current.width)
  const target = Math.round(width)
  if (!currentWidth || target >= currentWidth) return src
  const currentHeight = Number(current.height)
  const resized = options.map(([key, value]) => {
    if (key === 'width') return [key, String(target)]
    if (key === 'height' && currentHeight) return [key, String(Math.round((currentHeight * target) / currentWidth))]
    return [key, value]
  })
  return `${url.origin}${LUMA_PREFIX}${resized.map(([key, value]) => (value == null ? key : `${key}=${value}`)).join(',')}${rest.slice(slash)}${url.search}`
}
