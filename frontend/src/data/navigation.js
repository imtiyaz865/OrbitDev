import { communityLinks, validExternalUrl } from './communityLinks.js'

export const primaryNavigation = [
  { to: '/', label: 'Home' },
  { to: '/events', label: 'Events' },
  { to: '/community', label: 'Community' },
]

export function isActivePath(pathname, to) {
  if (to === '/') return pathname === '/'
  return pathname === to || pathname.startsWith(`${to}/`)
}

/** WhatsApp is where The Orbit shares updates. Falls back to the community page. */
export function updatesLink() {
  const whatsapp = communityLinks.find((link) => link.name === 'WhatsApp')
  const href = validExternalUrl(whatsapp?.url)
  return href ? { href, external: true } : { href: '/community#channels', external: false }
}
