import { ArrowUpRight, Instagram, Linkedin, MessageCircle } from 'lucide-react'
import { SiteHeader } from '../components/SiteHeader.jsx'

const channels = [
  {
    name: 'WhatsApp',
    url: import.meta.env.VITE_ORBIT_WHATSAPP_URL,
    Icon: MessageCircle,
  },
  {
    name: 'LinkedIn',
    url: import.meta.env.VITE_ORBIT_LINKEDIN_URL,
    Icon: Linkedin,
  },
  {
    name: 'Instagram',
    url: import.meta.env.VITE_ORBIT_INSTAGRAM_URL,
    Icon: Instagram,
  },
]

function validExternalUrl(value) {
  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password
      ? url.href
      : null
  } catch {
    return null
  }
}

function SocialButton({ channel }) {
  const href = validExternalUrl(channel.url)
  const label = href ? `${channel.name} (opens in a new tab)` : `${channel.name} unavailable`
  const content = (
    <>
      <span className="community-social-icon" aria-hidden="true">
        <channel.Icon size={20} strokeWidth={1.7} />
      </span>
      <span className="community-social-name">{channel.name}</span>
      {href ? <ArrowUpRight className="community-social-arrow" size={16} strokeWidth={1.8} aria-hidden="true" /> : null}
    </>
  )

  return (
    <li className={`community-social${href ? '' : ' is-unavailable'}`}>
      {href
        ? (
          <a href={href} target="_blank" rel="noopener noreferrer" aria-label={label}>
            {content}
          </a>
        )
        : (
          <span aria-disabled="true" aria-label={label}>
            {content}
          </span>
        )}
    </li>
  )
}

export function CommunityPage() {
  return (
    <main className="community-page">
      <SiteHeader />
      <section className="community-stage" aria-label="Community links">
        <h1 className="sr-only">The Orbit community</h1>
        <ul className="community-socials">
          {channels.map((channel) => <SocialButton key={channel.name} channel={channel} />)}
        </ul>
      </section>
    </main>
  )
}
