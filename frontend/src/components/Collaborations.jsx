import { useState } from 'react'
import { ArrowUpRight } from 'lucide-react'
import { validExternalUrl } from '../data/communityLinks.js'
import {
  COLLABORATIONS_FALLBACK_URL,
  associationLabel,
  collaborations,
  formatCollaborationDate,
  sortCollaborations,
} from '../data/collaborations.js'

const reportedMissing = new Set()

function reportMissingBanner(item) {
  if (!import.meta.env.DEV || reportedMissing.has(item.id)) return
  reportedMissing.add(item.id)
  console.warn(`[collaborations] Missing banner for "${item.title}". Expected file: public${item.banner}`)
}

/**
 * The original event banner, or a consistent branded panel when the file is
 * missing. The panel sits underneath the image, so nothing flashes while the
 * banner loads, and it is never presented as an event poster.
 */
export function CollaborationBanner({ item, eager = false }) {
  const [failed, setFailed] = useState(!item.banner)

  return (
    <div className="o-collab-media">
      <div className="o-collab-fallback" aria-hidden="true">
        <svg viewBox="0 0 100 100" focusable="false">
          <circle cx="50" cy="50" r="46" className="o-collab-fallback-orbit" />
          <circle cx="50" cy="50" r="28" className="o-collab-fallback-orbit is-dashed" />
          <circle cx="82.5" cy="17.5" r="2.6" className="o-collab-fallback-body" />
        </svg>
        <span className="o-collab-fallback-mark">The Orbit ×</span>
        <span className="o-collab-fallback-name">{item.partners[0]}</span>
      </div>
      {!failed && (
        <img
          src={item.banner}
          alt=""
          width="1600"
          height="900"
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          onError={() => {
            reportMissingBanner(item)
            setFailed(true)
          }}
        />
      )}
    </div>
  )
}

export function CollaborationCard({ item, featured = false }) {
  const announcement = validExternalUrl(item.announcementUrl)
  const href = announcement || COLLABORATIONS_FALLBACK_URL
  const linkText = announcement ? 'View announcement' : 'The Orbit on LinkedIn'
  const date = formatCollaborationDate(item)
  const titleId = `collab-${item.id}`

  return (
    <article className={`o-collab${featured ? ' is-featured' : ''}`} aria-labelledby={titleId}>
      <a
        className="o-collab-link"
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-labelledby={titleId}
        aria-describedby={`${titleId}-cta`}
      >
        <CollaborationBanner item={item} />
        <div className="o-collab-body">
          <p className="o-collab-meta">
            <span className={`o-collab-type is-${item.association}`}>{associationLabel(item)}</span>
            <span>{date || 'Date not listed'}</span>
          </p>
          <h3 id={titleId} className="o-collab-title">{item.title}</h3>
          <p className="o-collab-partners">
            <span>{item.partnerLabel}</span> {item.partners.join(', ')}
          </p>
          {item.supportingPartners?.length > 0 && (
            <p className="o-collab-partners is-secondary">
              <span>Also with</span> {item.supportingPartners.join(', ')}
            </p>
          )}
          <p className="o-collab-desc">{item.description}</p>
          <p className="o-collab-foot" id={`${titleId}-cta`}>
            <span>{linkText}<span className="o-sr-only"> (opens in a new tab)</span></span>
            <ArrowUpRight className="o-collab-arrow" size={16} strokeWidth={1.5} aria-hidden="true" />
          </p>
        </div>
      </a>
    </article>
  )
}

export function CollaborationsSection({ items = collaborations }) {
  const sorted = sortCollaborations(items)
  if (sorted.length === 0) return null

  return (
    <section className="tone-dark o-section o-collabs" id="collaborations" aria-labelledby="collaborations-title">
      <div className="o-wrap">
        <header className="o-section-head">
          <div>
            <p className="o-label">Collaborations</p>
            <h2 id="collaborations-title" className="o-h2 o-h2-lg">
              Better things happen <em>together.</em>
            </h2>
          </div>
          <p className="o-section-head-copy">
            The Orbit works alongside Hyderabad’s technology communities to bring builders, ideas and
            opportunities closer together.
          </p>
        </header>
        <ul className="o-collab-grid">
          {sorted.map((item) => (
            <li key={item.id} className={item.featured ? 'is-featured' : undefined}>
              <CollaborationCard item={item} featured={Boolean(item.featured)} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
