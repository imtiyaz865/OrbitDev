import { useEffect } from 'react'
import { communityLinks, validExternalUrl } from '../data/communityLinks.js'

export const SITE_NAME = 'The Orbit'
export const DEFAULT_TITLE = 'The Orbit · Tech events in Hyderabad, every weekend'
export const DEFAULT_DESCRIPTION = 'The Orbit lists Hyderabad’s tech events every week: meetups, workshops, hackathons and talks, with times, venues and registration links in one place.'
export const DEFAULT_IMAGE = '/brand/orbit-social.png'
export const DEFAULT_IMAGE_ALT = 'The Orbit Community logo'

/** Canonical origin. Set VITE_SITE_URL in production; falls back to the current origin. */
export function siteUrl() {
  const configured = (import.meta.env.VITE_SITE_URL || '').trim().replace(/\/+$/, '')
  if (/^https?:\/\//.test(configured)) return configured
  return typeof window === 'undefined' ? '' : window.location.origin
}

export function absoluteUrl(pathOrUrl) {
  if (!pathOrUrl) return ''
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl
  return `${siteUrl()}${pathOrUrl.startsWith('/') ? '' : '/'}${pathOrUrl}`
}

export function truncate(text, max = 160) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim()
  if (clean.length <= max) return clean
  const cut = clean.slice(0, max - 1)
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), max * .6)).replace(/[\s,.;:–-]+$/, '')}…`
}

function upsertMeta(attribute, key, content) {
  let element = document.head.querySelector(`meta[${attribute}="${key}"]`)
  if (!content) {
    element?.remove()
    return
  }
  if (!element) {
    element = document.createElement('meta')
    element.setAttribute(attribute, key)
    document.head.appendChild(element)
  }
  element.setAttribute('content', content)
}

function upsertCanonical(href) {
  let element = document.head.querySelector('link[rel="canonical"]')
  if (!href) {
    element?.remove()
    return
  }
  if (!element) {
    element = document.createElement('link')
    element.setAttribute('rel', 'canonical')
    document.head.appendChild(element)
  }
  element.setAttribute('href', href)
}

const JSON_LD_ID = 'orbit-jsonld'

function setJsonLd(data) {
  document.getElementById(JSON_LD_ID)?.remove()
  if (!data) return
  const script = document.createElement('script')
  script.type = 'application/ld+json'
  script.id = JSON_LD_ID
  // Escape "<" so data can never close the script element.
  script.textContent = JSON.stringify(data).replace(/</g, '\\u003c')
  document.head.appendChild(script)
}

/**
 * Sets per-route document metadata. Client-side only: crawlers that do not
 * execute JavaScript see the static defaults in index.html instead.
 */
export function useSeo({
  title = DEFAULT_TITLE,
  description = DEFAULT_DESCRIPTION,
  path,
  image = DEFAULT_IMAGE,
  imageAlt = DEFAULT_IMAGE_ALT,
  type = 'website',
  robots = 'index, follow',
  jsonLd = null,
}) {
  const jsonLdKey = jsonLd ? JSON.stringify(jsonLd) : ''

  useEffect(() => {
    const url = path ? absoluteUrl(path) : ''
    const imageUrl = absoluteUrl(image)
    const indexable = !/noindex/i.test(robots)

    document.title = title
    upsertMeta('name', 'description', description)
    upsertMeta('name', 'robots', robots)
    upsertCanonical(indexable ? url : '')

    upsertMeta('property', 'og:type', type)
    upsertMeta('property', 'og:site_name', SITE_NAME)
    upsertMeta('property', 'og:title', title)
    upsertMeta('property', 'og:description', description)
    upsertMeta('property', 'og:url', url)
    upsertMeta('property', 'og:image', imageUrl)
    upsertMeta('property', 'og:image:alt', imageAlt)
    upsertMeta('property', 'og:locale', 'en_IN')
    // Dimensions are only known for the bundled default image.
    const isDefaultImage = image === DEFAULT_IMAGE
    upsertMeta('property', 'og:image:width', isDefaultImage ? '1200' : '')
    upsertMeta('property', 'og:image:height', isDefaultImage ? '630' : '')

    upsertMeta('name', 'twitter:card', 'summary_large_image')
    upsertMeta('name', 'twitter:title', title)
    upsertMeta('name', 'twitter:description', description)
    upsertMeta('name', 'twitter:image', imageUrl)
    upsertMeta('name', 'twitter:image:alt', imageAlt)

    setJsonLd(jsonLdKey ? JSON.parse(jsonLdKey) : null)
  }, [title, description, path, image, imageAlt, type, robots, jsonLdKey])

  useEffect(() => () => setJsonLd(null), [])
}

/** Site-wide structured data, used on the home page. */
export function siteJsonLd() {
  const origin = siteUrl()
  const sameAs = communityLinks.map((link) => validExternalUrl(link.url)).filter(Boolean)
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': `${origin}/#website`,
        url: `${origin}/`,
        name: SITE_NAME,
        description: DEFAULT_DESCRIPTION,
        inLanguage: 'en-IN',
        publisher: { '@id': `${origin}/#organization` },
      },
      {
        '@type': 'Organization',
        '@id': `${origin}/#organization`,
        name: SITE_NAME,
        url: `${origin}/`,
        logo: absoluteUrl('/brand/orbit-stacked-dark.png'),
        areaServed: { '@type': 'City', name: 'Hyderabad' },
        ...(sameAs.length ? { sameAs } : {}),
      },
    ],
  }
}
