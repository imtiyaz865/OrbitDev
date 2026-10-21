import { useEffect, useState } from 'react'
import { ArrowLeft, ArrowUpRight, CalendarDays, Clock3, MapPin } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { SiteHeader } from '../components/SiteHeader.jsx'
import { SiteFooter } from '../components/SiteFooter.jsx'
import { ScrollReveal } from '../components/ScrollReveal.jsx'
import { api } from '../services/api.js'
import { formatEventDate } from '../utils/weekends.js'
import { eventDateInIndia, formatEventTimeInIndia } from '../utils/times.js'

function Section({ title, children, className = '' }) {
  return (
    <ScrollReveal className={`detail-section ${className}`}>
      <div className="detail-section-label">{title}</div>
      <div className="detail-section-content">{children}</div>
    </ScrollReveal>
  )
}

export function EventDetailPage() {
  const { slug } = useParams()
  const [event, setEvent] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retryKey, setRetryKey] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setEvent(null)
    setError('')
    api.getEvent(slug, controller.signal)
      .then(setEvent)
      .catch((err) => { if (err.name !== 'AbortError') setError(err.message) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [slug, retryKey])

  useEffect(() => {
    if (!event) return undefined

    const previousTitle = document.title
    const descriptionTag = document.querySelector('meta[name="description"]')
    const previousDescription = descriptionTag?.content
    const title = `${event.name} | ORBIT`
    const description = (event.description || `${event.name}${event.event_type ? ` — ${event.event_type}` : ''}.`)
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 160)
    document.title = title
    descriptionTag?.setAttribute('content', description)
    const socialMetadata = [
      ['property', 'og:title', title],
      ['property', 'og:description', description],
      ['property', 'og:url', window.location.href],
      ...(event.banner_url ? [['property', 'og:image', event.banner_url]] : []),
      ['name', 'twitter:title', title],
      ['name', 'twitter:description', description],
    ]
    const previousSocialMetadata = socialMetadata.map(([selector, name, content]) => {
      let tag = document.querySelector(`meta[${selector}="${name}"]`)
      const previousContent = tag?.content
      if (!tag) {
        tag = document.createElement('meta')
        tag.setAttribute(selector, name)
        document.head.appendChild(tag)
      }
      tag.setAttribute('content', content)
      return { tag, previousContent }
    })

    const structuredData = {
      '@context': 'https://schema.org',
      '@type': 'Event',
      name: event.name,
      url: window.location.href,
      ...(event.description ? { description: event.description } : {}),
      ...(event.start_at || event.start_date ? { startDate: event.start_at || event.start_date } : {}),
      ...(event.end_at || event.end_date ? { endDate: event.end_at || event.end_date } : {}),
      ...(event.banner_url ? { image: [event.banner_url] } : {}),
      ...(event.organizer_name ? {
        organizer: {
          '@type': 'Organization',
          name: event.organizer_name,
          ...(event.organizer_website ? { url: event.organizer_website } : {}),
        },
      } : {}),
      ...(event.attendance_mode === 'online' ? { eventAttendanceMode: 'https://schema.org/OnlineEventAttendanceMode' } : {}),
      ...(event.attendance_mode === 'offline' ? { eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode' } : {}),
      ...(event.attendance_mode === 'mixed' ? { eventAttendanceMode: 'https://schema.org/MixedEventAttendanceMode' } : {}),
      ...(event.venue_name || event.address || event.city ? {
        location: {
          '@type': 'Place',
          ...(event.venue_name ? { name: event.venue_name } : {}),
          ...([event.address, event.city].filter(Boolean).length ? {
            address: {
              '@type': 'PostalAddress',
              ...(event.address ? { streetAddress: event.address } : {}),
              ...(event.city ? { addressLocality: event.city } : {}),
            },
          } : {}),
        },
      } : {}),
    }

    let script = document.getElementById('orbit-event-schema')
    if (!script) {
      script = document.createElement('script')
      script.id = 'orbit-event-schema'
      script.type = 'application/ld+json'
      document.head.appendChild(script)
    }
    script.textContent = JSON.stringify(structuredData)

    return () => {
      document.title = previousTitle
      if (previousDescription != null) descriptionTag?.setAttribute('content', previousDescription)
      previousSocialMetadata.forEach(({ tag, previousContent }) => {
        if (previousContent != null) tag?.setAttribute('content', previousContent)
        else tag?.remove()
      })
      script.remove()
    }
  }, [event])

  if (loading) return (
    <main className="detail-page">
      <div className="page-shell"><SiteHeader /><div className="detail-state">Opening the event…</div></div>
      <SiteFooter />
    </main>
  )
  if (error || !event) return (
    <main className="detail-page">
      <div className="page-shell">
        <SiteHeader />
        <div className="detail-state">
          <p>{error ? 'This event could not be loaded.' : 'This event could not be found.'}</p>
          {error && <span>{error}</span>}
          <div className="detail-state-actions">
            {error && <button className="text-link" type="button" onClick={() => setRetryKey((key) => key + 1)}>Try again</button>}
            <Link to="/" className="text-link"><ArrowLeft size={15} /> Back to weekends</Link>
          </div>
        </div>
      </div>
      <SiteFooter />
    </main>
  )

  const date = eventDateInIndia(event)
  const startTime = formatEventTimeInIndia(event)
  const endTime = formatEventTimeInIndia(event, 'end')
  const venue = [event.venue_name, event.address, event.city].filter(Boolean).join(', ')
  const speakers = event.speakers || []
  const sponsors = event.sponsors || []
  const agenda = event.agenda_items || event.agenda || []

  return (
    <main className="detail-page">
      <div className="page-shell">
        <SiteHeader />
        <Link to="/" className="back-link"><ArrowLeft size={14} /> Browse weekends</Link>
        <article className="event-detail">
          <header className="detail-heading">
            <p className="section-eyebrow">{event.event_type || 'COMMUNITY GATHERING'}</p>
            <h1>{event.name}</h1>
            <p className="detail-deck">An event in the Hyderabad community calendar.</p>
          </header>
          {event.banner_url && (
            <div className="detail-banner">
              <img src={event.banner_url} alt={`${event.name} event`} fetchPriority="high" />
            </div>
          )}

          <div className="event-detail-layout">
            <div className="detail-content">
              {event.description && <Section title="ABOUT THIS EVENT"><div className="description-copy">{event.description.split(/\n{2,}/).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div></Section>}
              {speakers.length > 0 && <Section title="SPEAKERS"><div className="speaker-list">{speakers.map((speaker, index) => <article className="speaker-item" key={speaker.id || index}>{speaker.image_url && <img src={speaker.image_url} alt="" loading="lazy" /> }<div><h3>{speaker.name}</h3><p>{[speaker.role, speaker.organization].filter(Boolean).join(' · ')}</p>{speaker.biography && <p className="speaker-bio">{speaker.biography}</p>}</div></article>)}</div></Section>}
              {agenda.length > 0 && <Section title="SCHEDULE"><div className="agenda-list">{agenda.map((item, index) => <article className="agenda-item" key={item.id || index}><div className="agenda-time">{[item.start_time, item.end_time].filter(Boolean).map((time) => formatEventTimeInIndia({ start_time: time }, 'start')).join(' – ') || '—'}</div><div><h3>{item.title}</h3>{item.speaker_name && <span className="agenda-speaker">{item.speaker_name}</span>}{item.description && <p>{item.description}</p>}</div></article>)}</div></Section>}
              {event.organizer_name && <Section title="HOSTED BY"><div className="organizer-block"><h3>{event.organizer_name}</h3>{event.organizer_website && <a href={event.organizer_website} target="_blank" rel="noreferrer">{event.organizer_website} <ArrowUpRight size={14} /></a>}</div></Section>}
              {sponsors.length > 0 && <Section title="PARTNERS"><div className="sponsor-list">{sponsors.map((sponsor, index) => <a key={sponsor.id || index} href={sponsor.website || undefined} target="_blank" rel="noreferrer">{sponsor.logo_url && <img src={sponsor.logo_url} alt="" loading="lazy" />}<span>{sponsor.name}</span></a>)}</div></Section>}
              {event.source_url && <div className="source-link"><span>EVENT SOURCE</span><a href={event.source_url} target="_blank" rel="noreferrer">{(() => { try { return new URL(event.source_url).hostname } catch { return 'Visit event source' } })()} <ArrowUpRight size={13} /></a></div>}
            </div>

            <aside className="detail-aside" aria-label="Event information">
              <p className="detail-aside-kicker">EVENT DETAILS</p>
              <dl className="detail-facts">
                {date && <div><dt><CalendarDays size={16} /> DATE</dt><dd>{formatEventDate(date, event.timezone)}</dd></div>}
                <div><dt><Clock3 size={16} /> TIME</dt><dd>{startTime ? `${startTime}${endTime ? ` – ${endTime}` : ''}` : 'To be confirmed'}</dd></div>
                {(venue || event.attendance_mode === 'online' || event.online_details) && <div><dt><MapPin size={16} /> LOCATION</dt><dd>{venue || 'Online'}{event.online_details && <small>{event.online_details}</small>}</dd></div>}
                {event.organizer_name && <div><dt>ORGANIZER</dt><dd>{event.organizer_website ? <a href={event.organizer_website} target="_blank" rel="noreferrer">{event.organizer_name} <ArrowUpRight size={13} /></a> : event.organizer_name}</dd></div>}
                {event.registration_fee_type && <div><dt>ADMISSION</dt><dd>{event.registration_fee_type === 'free' ? 'Free' : event.registration_amount ? `${event.registration_currency || ''} ${event.registration_amount}`.trim() : event.registration_fee_type}</dd></div>}
              </dl>
              {event.registration_url
                ? <a className="register-button" href={event.registration_url} target="_blank" rel="noopener noreferrer">Registration details <ArrowUpRight size={16} /></a>
                : <p className="detail-registration-note">Registration details are not available yet.</p>}
            </aside>
          </div>
        </article>
      </div>
      <SiteFooter />
    </main>
  )
}
