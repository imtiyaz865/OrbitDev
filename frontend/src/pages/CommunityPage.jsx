import { ArrowUpRight, Instagram, Linkedin, MessageCircle } from 'lucide-react'
import { useEffect } from 'react'
import { SiteHeader } from '../components/SiteHeader.jsx'
import { SiteFooter } from '../components/SiteFooter.jsx'

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
  useEffect(() => {
    const previousTitle = document.title
    document.title = 'ORBIT Community | Hyderabad'
    return () => { document.title = previousTitle }
  }, [])

  return (
    <main className="community-page">
      <div className="page-shell">
        <SiteHeader />
        <section className="community-stage" aria-labelledby="community-title">
          <div className="community-intro">
            <p className="section-eyebrow">THE LOCAL NETWORK</p>
            <h1 id="community-title">Good ideas<br />travel <em>together.</em></h1>
            <p>Stay close to the people and gatherings shaping Hyderabad&apos;s technology community.</p>
          </div>
          <div className="community-channel-panel">
            <div className="community-channel-heading">
              <span>FOLLOW ORBIT</span>
              <span>OFFICIAL CHANNELS</span>
            </div>
            <ul className="community-socials">
              {channels.map((channel) => <SocialButton key={channel.name} channel={channel} />)}
            </ul>
          </div>
        </section>
      </div>
      <SiteFooter />
    </main>
  )
}
