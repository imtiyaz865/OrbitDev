import { useEffect, useState } from 'react'
import { ArrowLeft, ArrowUpRight, ExternalLink } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../services/api.js'
import { formatEventDate } from '../utils/weekends.js'
import {
  eventDateTimeInIndia,
  eventDateInIndia,
  formatEventTimeInIndia,
  formatIndiaDate,
} from '../utils/times.js'
import { eventTimingStatus } from '../utils/eventStatus.js'
import { EventArtwork } from '../components/OrbitRings.jsx'
import { SITE_NAME, absoluteUrl, truncate, useSeo } from '../seo/useSeo.js'


function safeExternalUrl(value) {
  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password
      ? url.href
      : null
  } catch {
    return null
  }
}

function entries(value) {
  return Array.isArray(value) ? value.filter((item) => item && typeof item === 'object') : []
}

function formatFee(event) {
  const feeType = event.registration_fee_type?.trim().toLowerCase()
  const amount = event.registration_amount != null && event.registration_amount !== ''
    ? Number(event.registration_amount)
    : Number.NaN
  const currency = event.registration_currency?.trim().toUpperCase()

  if (feeType === 'free') return 'Free'
  if (feeType === 'donation') return 'Donation'
  if (Number.isFinite(amount) && event.registration_amount != null && currency) {
    try {
      return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency,
        maximumFractionDigits: 2,
      }).format(amount)
    } catch {
      return `${currency} ${amount.toLocaleString('en-IN')}`
    }
  }
  if (Number.isFinite(amount) && event.registration_amount != null) {
    return `${amount.toLocaleString('en-IN')} ${currency || ''}`.trim()
  }
  if (feeType === 'paid') return 'Paid'
  return ''
}

function registrationState(event, registrationUrl) {
  const rawStatus = event.registration_status?.trim()
  const status = rawStatus
    ?.replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
  if (!registrationUrl) {
    return { label: status || 'Registration link not provided', available: false }
  }
  if (status) return {
    label: status,
    available: !/closed|sold\s?out|full|unavailable|cancelled|canceled|expired/i.test(status),
  }
  return { label: 'Registration available', available: true }
}

function ImageWithFallback({
  src,
  alt = '',
  className = '',
  fallbackLabel = '',
  fallbackClassName = '',
  loading = 'lazy',
  fetchPriority,
}) {
  const imageUrl = safeExternalUrl(src)
  const [failed, setFailed] = useState(false)

  useEffect(() => setFailed(false), [imageUrl])

  if (!imageUrl || failed) {
    return (
      <div className={`${fallbackClassName} is-unavailable`} role={alt ? 'img' : undefined} aria-label={alt || undefined}>
        {fallbackLabel}
      </div>
    )
  }

  return (
    <img
      className={className}
      src={imageUrl}
      alt={alt}
      loading={loading}
      decoding="async"
      fetchpriority={fetchPriority}
      onError={() => setFailed(true)}
    />
  )
}


function Section({ id, label, title, children }) {
  return (
    <section className="o-detail-section" aria-labelledby={id}>
      <p className="o-label">{label}</p>
      <h2 id={id}>{title}</h2>
      <div className="o-detail-section-body">{children}</div>
    </section>
  )
}

function SpeakerItem({ speaker }) {
  const name = speaker.name.trim()
  const profileUrl = safeExternalUrl(speaker.profile_url || speaker.website || speaker.linkedin_url)
  const role = [speaker.role, speaker.organization].filter(Boolean).join(' · ')

  return (
    <li className="o-speaker">
      <ImageWithFallback
        className="o-speaker-photo"
        src={speaker.image_url}
        alt={speaker.image_url ? name : ''}
        fallbackClassName="o-speaker-photo o-speaker-photo-fallback"
        fallbackLabel={name.slice(0, 1).toUpperCase()}
      />
      <div>
        <h3>{name}</h3>
        {role && <p className="o-speaker-role">{role}</p>}
        {speaker.biography && <p className="o-speaker-bio">{speaker.biography}</p>}
        {profileUrl && (
          <a className="o-link o-link-small" href={profileUrl} target="_blank" rel="noopener noreferrer" aria-label={`${name}'s profile (opens in a new tab)`}>
            Profile <ArrowUpRight size={13} aria-hidden="true" />
          </a>
        )}
      </div>
    </li>
  )
}

function Agenda({ items, event }) {
  return (
    <ol className="o-agenda">
      {items.map((item, index) => {
        const timeRange = [item.start_time, item.end_time]
          .filter(Boolean)
          .map((time) => formatEventTimeInIndia({ ...event, start_at: null, start_time: time }, 'start'))
          .filter(Boolean)
          .join(' – ')
        return (
          <li className="o-agenda-item" key={item.id || `${item.title || 'session'}-${index}`}>
            <span className="o-agenda-time">{timeRange || 'Time TBC'}</span>
            <div>
              {item.title && <h3>{item.title}</h3>}
              {item.speaker_name && <p className="o-agenda-speaker">{item.speaker_name}</p>}
              {item.description && <p className="o-agenda-desc">{item.description}</p>}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

function Sponsors({ sponsors }) {
  return (
    <ul className="o-sponsors">
      {sponsors.map((sponsor, index) => {
        const name = sponsor.name.trim()
        const website = safeExternalUrl(sponsor.website)
        const content = (
          <>
            <ImageWithFallback
              className="o-sponsor-logo"
              src={sponsor.logo_url}
              alt=""
              fallbackClassName="o-sponsor-logo o-sponsor-logo-fallback"
              fallbackLabel={name.slice(0, 1).toUpperCase()}
            />
            <span>{name}</span>
            {website && <ArrowUpRight size={14} aria-hidden="true" />}
          </>
        )
        return (
          <li key={sponsor.id || `${name}-${index}`}>
            {website
              ? <a href={website} target="_blank" rel="noopener noreferrer" aria-label={`${name} (opens in a new tab)`}>{content}</a>
              : <div>{content}</div>}
          </li>
        )
      })}
    </ul>
  )
}

function DetailState({ kicker, title, children, role = 'status' }) {
  return (
    <section className="tone-dark o-page-hero o-detail-state" role={role} aria-live="polite">
      <div className="o-wrap">
        <p className="o-label">{kicker}</p>
        <h1 className="o-h1">{title}</h1>
        {children}
      </div>
    </section>
  )
}

function modeLabel(mode) {
  if (mode === 'mixed') return 'Hybrid · in person and online'
  if (mode === 'online') return 'Online'
  if (mode === 'offline') return 'In person'
  return ''
}

const ATTENDANCE_MODES = {
  offline: 'https://schema.org/OfflineEventAttendanceMode',
  online: 'https://schema.org/OnlineEventAttendanceMode',
  mixed: 'https://schema.org/MixedEventAttendanceMode',
}

function clean(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function isoStart(event, edge) {
  const instant = clean(event[`${edge}_at`])
  if (instant && !Number.isNaN(Date.parse(instant))) return instant
  return clean(event[`${edge}_date`]) || ''
}

/** schema.org Event built strictly from fields the API returned. */
function eventJsonLd(event, path) {
  const name = clean(event.name)
  const startDate = isoStart(event, 'start')
  if (!name || !startDate) return null
  const mode = clean(event.attendance_mode).toLowerCase()
  const venue = clean(event.venue_name)
  const address = clean(event.address)
  const city = clean(event.city)
  const onlineUrl = safeExternalUrl(clean(event.online_details))
  const locations = []
  if (mode !== 'online' && (venue || address || city)) {
    locations.push({
      '@type': 'Place',
      ...(venue ? { name: venue } : {}),
      ...((address || city) ? {
        address: {
          '@type': 'PostalAddress',
          ...(address ? { streetAddress: address } : {}),
          ...(city ? { addressLocality: city } : {}),
        },
      } : {}),
    })
  }
  if (mode !== 'offline' && onlineUrl) locations.push({ '@type': 'VirtualLocation', url: onlineUrl })

  const organizer = clean(event.organizer_name)
  const organizerUrl = safeExternalUrl(event.organizer_website)
  const banner = safeExternalUrl(event.banner_url)
  const registrationUrl = safeExternalUrl(event.registration_url)
  const feeType = clean(event.registration_fee_type).toLowerCase()
  const amount = event.registration_amount != null && event.registration_amount !== '' ? Number(event.registration_amount) : Number.NaN
  const currency = clean(event.registration_currency).toUpperCase()
  const price = feeType === 'free' ? 0 : Number.isFinite(amount) ? amount : null
  const speakers = entries(event.speakers).map((speaker) => clean(speaker.name)).filter(Boolean)
  const endDate = isoStart(event, 'end')

  return {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name,
    url: absoluteUrl(path),
    startDate,
    ...(endDate ? { endDate } : {}),
    ...(clean(event.description) ? { description: truncate(event.description, 500) } : {}),
    ...(ATTENDANCE_MODES[mode] ? { eventAttendanceMode: ATTENDANCE_MODES[mode] } : {}),
    ...(locations.length ? { location: locations.length === 1 ? locations[0] : locations } : {}),
    ...(banner ? { image: [banner] } : {}),
    ...(organizer ? { organizer: { '@type': 'Organization', name: organizer, ...(organizerUrl ? { url: organizerUrl } : {}) } } : {}),
    ...(speakers.length ? { performer: speakers.map((speakerName) => ({ '@type': 'Person', name: speakerName })) } : {}),
    ...(registrationUrl ? {
      offers: {
        '@type': 'Offer',
        url: registrationUrl,
        ...(price !== null ? { price } : {}),
        ...(price !== null && currency ? { priceCurrency: currency } : {}),
      },
    } : {}),
  }
}

/** Meta description from the event's own text, or its real facts when there is none. */
function eventDescription(event) {
  const description = clean(event.description)
  if (description) return truncate(description)
  const date = eventDateInIndia(event)
  const parts = [
    clean(event.event_type) || 'Tech event',
    date ? `on ${formatEventDate(date, event.timezone)}` : '',
    clean(event.venue_name) ? `at ${clean(event.venue_name)}` : clean(event.city) ? `in ${clean(event.city)}` : '',
    clean(event.organizer_name) ? `hosted by ${clean(event.organizer_name)}` : '',
  ].filter(Boolean)
  return truncate(`${parts.join(' ')}. Details and registration on ${SITE_NAME}.`)
}

function useEventSeo(event, slug, loading) {
  const path = `/events/${encodeURIComponent(slug || '')}`
  const name = clean(event?.name)
  const banner = event ? safeExternalUrl(event.banner_url) : null
  useSeo(event && name ? {
    title: `${name} · ${SITE_NAME}`,
    description: eventDescription(event),
    path,
    ...(banner ? { image: banner, imageAlt: `${name} banner` } : {}),
    jsonLd: eventJsonLd(event, path),
  } : {
    title: loading ? `Loading event · ${SITE_NAME}` : `Event not available · ${SITE_NAME}`,
    robots: loading ? 'index, follow' : 'noindex, follow',
    path: loading ? path : undefined,
  })
}

export function EventDetailPage() {
  const { slug } = useParams()
  const [event, setEvent] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    setEvent(null)
    setError('')
    setLoading(true)
    api.getEvent(slug, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setEvent(result)
      })
      .catch((requestError) => {
        if (!controller.signal.aborted && requestError.name !== 'AbortError') {
          setError(requestError.message || 'This event could not be loaded.')
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [slug])

  useEventSeo(event, slug, loading)

  if (loading) {
    return <DetailState kicker="Events" title="Loading event…" />
  }

  if (error || !event) {
    return (
      <DetailState kicker="Events" role="alert" title="This event isn’t available.">
        <p className="o-lead">
          {error === 'Event not found.' || !error
            ? 'It may have been removed, renamed or never published.'
            : 'We couldn’t load it just now. Check your connection and try again.'}
        </p>
        <Link to="/events" className="o-button o-button-light"><ArrowLeft size={15} aria-hidden="true" /> Back to all events</Link>
      </DetailState>
    )
  }

  const date = eventDateInIndia(event)
  const endDate = eventDateTimeInIndia(event, 'end')?.date
  const startTime = formatEventTimeInIndia(event)
  const endTime = formatEventTimeInIndia(event, 'end')
  const mode = event.attendance_mode?.trim().toLowerCase()
  const venue = [event.venue_name, event.address, event.city]
    .filter((part) => typeof part === 'string' && part.trim())
    .join(', ')
  const onlineDetails = event.online_details?.trim()
  const speakers = entries(event.speakers).filter((speaker) => speaker.name?.trim())
  const agenda = entries(event.agenda_items || event.agenda).filter((item) => (
    item.title?.trim() || item.start_time || item.end_time || item.speaker_name?.trim() || item.description?.trim()
  ))
  const sponsors = entries(event.sponsors).filter((sponsor) => sponsor.name?.trim())
  const registrationUrl = safeExternalUrl(event.registration_url)
  const sourceUrl = safeExternalUrl(event.source_url)
  const registration = registrationState(event, registrationUrl)
  const fee = formatFee(event)
  const title = event.name?.trim() || 'Event details'
  const organizer = event.organizer_name?.trim()
  const organizerWebsite = safeExternalUrl(event.organizer_website)
  const originalHost = sourceUrl ? new URL(sourceUrl).hostname.replace(/^www\./, '') : ''
  const timing = eventTimingStatus(event)
  const description = event.description?.trim()
  const dateLabel = date
    ? `${formatEventDate(date, event.timezone)}${endDate && endDate !== date ? ` – ${formatEventDate(endDate, event.timezone)}` : ''}`
    : 'Date to be announced'
  const timeLabel = startTime ? `${startTime}${endTime ? ` – ${endTime}` : ''} IST` : 'Time to be announced'
  const deadline = event.registration_deadline
    ? formatIndiaDate(
      eventDateTimeInIndia({ start_at: event.registration_deadline })?.date || event.registration_deadline.slice(0, 10),
      { day: 'numeric', month: 'long', year: 'numeric' },
    )
    : ''
  const registerLabel = registration.available ? 'Register' : 'Registration details'

  return (
    <article className="o-detail">
      <header className="tone-dark o-detail-hero">
        <div className="o-wrap">
          <Link to="/events" className="o-back"><ArrowLeft size={14} aria-hidden="true" /> All events</Link>
          <div className="o-detail-hero-grid">
            <figure className={`o-detail-banner${event.banner_url ? '' : ' is-empty'}`}>
              <ImageWithFallback
                src={event.banner_url}
                alt={event.banner_url ? `${title} banner` : ''}
                fallbackClassName="o-detail-banner-fallback"
                fallbackLabel={<EventArtwork />}
                loading="eager"
                fetchPriority="high"
              />
            </figure>
            <div className="o-detail-heading">
              <p className="o-label">
                <span>{event.event_type?.trim() || 'Tech event'}</span>
                {timing && <span className={`o-chip is-${timing.key}`}>{timing.label}</span>}
              </p>
              <h1 id="event-title">{title}</h1>
              {organizer && (
                <div className="o-organizer">
                  <ImageWithFallback
                    className="o-organizer-logo"
                    src={event.organizer_logo_url}
                    alt=""
                    fallbackClassName="o-organizer-logo o-organizer-logo-fallback"
                    fallbackLabel={organizer.slice(0, 1).toUpperCase()}
                  />
                  <div>
                    <span className="o-label">Hosted by</span>
                    {organizerWebsite ? (
                      <a href={organizerWebsite} target="_blank" rel="noopener noreferrer" aria-label={`${organizer} website (opens in a new tab)`}>
                        {organizer} <ArrowUpRight size={14} aria-hidden="true" />
                      </a>
                    ) : <strong>{organizer}</strong>}
                  </div>
                </div>
              )}
              <dl className="o-detail-quickfacts">
                <div><dt>When</dt><dd>{dateLabel}<span>{timeLabel}</span></dd></div>
                {(venue || mode) && (
                  <div><dt>Where</dt><dd>{venue || modeLabel(mode)}{venue && mode && <span>{modeLabel(mode)}</span>}</dd></div>
                )}
              </dl>
            </div>
          </div>
        </div>
      </header>

      <div className="tone-light o-detail-body">
        <div className="o-wrap o-detail-layout">
          <aside className="o-detail-aside" aria-labelledby="registration-title">
            <div className="o-register">
              <h2 id="registration-title" className="o-label">Registration</h2>
              <p className={`o-register-status${registration.available ? ' is-open' : ''}`}>
                <i aria-hidden="true" />{registration.label}
              </p>
              {fee && <p className="o-register-fee"><span>Entry</span><strong>{fee}</strong></p>}
              {deadline && <p className="o-register-fee"><span>Register by</span><strong>{deadline}</strong></p>}
              {registrationUrl ? (
                <a
                  className="o-button o-button-dark o-button-block"
                  href={registrationUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`${registerLabel} for ${title} (opens in a new tab)`}
                >
                  {registerLabel} <ArrowUpRight size={16} strokeWidth={1.6} aria-hidden="true" />
                </a>
              ) : (
                <p className="o-register-note">The organiser hasn’t shared a registration link yet.</p>
              )}
              {registrationUrl && <p className="o-register-note">Registration happens on the organiser’s page.</p>}
            </div>

            <dl className="o-facts">
              <div><dt>Date</dt><dd>{dateLabel}</dd></div>
              <div><dt>Time</dt><dd>{timeLabel}</dd></div>
              {mode && <div><dt>Format</dt><dd>{modeLabel(mode)}</dd></div>}
              {venue && <div><dt>Venue</dt><dd>{venue}</dd></div>}
              {onlineDetails && <div><dt>Online</dt><dd>{onlineDetails}</dd></div>}
            </dl>
          </aside>

          <div className="o-detail-main">
            {description && (
              <Section id="about-title" label="About" title="What to expect">
                <div className="o-prose">
                  {description.split(/\n{2,}/).map((paragraph, index) => <p key={index}>{paragraph}</p>)}
                </div>
              </Section>
            )}

            {speakers.length > 0 && (
              <Section id="speakers-title" label="Speakers" title={speakers.length === 1 ? 'On stage' : 'Who’s speaking'}>
                <ul className="o-speakers">
                  {speakers.map((speaker, index) => <SpeakerItem key={speaker.id || `${speaker.name}-${index}`} speaker={speaker} />)}
                </ul>
              </Section>
            )}

            {agenda.length > 0 && (
              <Section id="agenda-title" label="Agenda" title="How the day runs">
                <Agenda items={agenda} event={event} />
              </Section>
            )}

            {sponsors.length > 0 && (
              <Section id="sponsors-title" label="Partners" title="Made possible by">
                <Sponsors sponsors={sponsors} />
              </Section>
            )}

            {sourceUrl && (
              <p className="o-source">
                <span className="o-label">Source</span>
                <a href={sourceUrl} target="_blank" rel="noopener noreferrer" aria-label={`Original event page on ${originalHost} (opens in a new tab)`}>
                  {originalHost} <ExternalLink size={13} aria-hidden="true" />
                </a>
              </p>
            )}

            <Link to="/events" className="o-link"><ArrowLeft size={14} aria-hidden="true" /> Back to all events</Link>
          </div>
        </div>
      </div>

      {registrationUrl && (
        <div className="o-register-bar">
          <div>
            <span className="o-label">{fee || 'Registration'}</span>
            <strong>{registration.label}</strong>
          </div>
          <a
            className="o-button o-button-light"
            href={registrationUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${registerLabel} for ${title} (opens in a new tab)`}
          >
            {registerLabel} <ArrowUpRight size={15} aria-hidden="true" />
          </a>
        </div>
      )}
    </article>
  )
}
