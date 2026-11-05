import { ArrowUp, ArrowUpRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Logo } from './Logo.jsx'
import { StarField } from './StarField.jsx'
import { UpdatesCta } from './SiteHeader.jsx'
import { communityLinks, validExternalUrl } from '../data/communityLinks.js'
import { primaryNavigation } from '../data/navigation.js'

function scrollToTop(event) {
  event.preventDefault()
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' })
}

export function SiteFooter() {
  const socials = communityLinks
    .map((link) => ({ ...link, href: validExternalUrl(link.url) }))
    .filter((link) => link.href)

  return (
    <footer className="o-footer tone-dark">
      <StarField seed={23} />
      <div className="o-wrap">
        <div className="o-footer-cta">
          <div>
            <h2>Get Hyderabad&apos;s tech events every week.</h2>
            <p>One short update with the weekend&apos;s meetups, workshops and hackathons.</p>
          </div>
          <div className="o-footer-actions">
            <UpdatesCta className="o-button o-button-light" label="Get weekly updates" />
            <Link className="o-link" to="/events">Browse events</Link>
          </div>
        </div>

        <div className="o-footer-grid">
          <div className="o-footer-brand">
            <Link to="/" aria-label="The Orbit, home"><Logo tone="light" /></Link>
            <p>A weekly guide to tech events in Hyderabad: meetups, workshops, hackathons and talks, with the details you need to attend.</p>
          </div>
          <nav className="o-footer-col" aria-label="Footer">
            <p className="o-label">Explore</p>
            {primaryNavigation.map((item) => <Link key={item.to} to={item.to}>{item.label}</Link>)}
          </nav>
          <div className="o-footer-col">
            <p className="o-label">Follow</p>
            {socials.length > 0
              ? socials.map(({ name, href }) => (
                <a key={name} href={href} target="_blank" rel="noopener noreferrer" aria-label={`${name} (opens in a new tab)`}>
                  {name} <ArrowUpRight size={13} strokeWidth={1.5} aria-hidden="true" />
                </a>
              ))
              : <span className="o-muted">Channels opening soon</span>}
          </div>
        </div>

        <div className="o-footer-meta">
          <span>© {new Date().getFullYear()} The Orbit · Hyderabad, India</span>
          <a href="#top" className="o-footer-top" onClick={scrollToTop}>
            Back to top <ArrowUp size={13} strokeWidth={1.5} aria-hidden="true" />
          </a>
        </div>
      </div>
    </footer>
  )
}
