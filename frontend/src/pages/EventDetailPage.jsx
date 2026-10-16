import { useEffect, useState } from 'react'
import { ArrowLeft, ArrowUpRight, CalendarDays, Clock3, MapPin } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { SiteHeader } from '../components/SiteHeader.jsx'
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

  useEffect(() => {
    const controller = new AbortController()
    api.getEvent(slug, controller.signal)
      .then(setEvent)
      .catch((err) => { if (err.name !== 'AbortError') setError(err.message) })
      .finally(() => setLoading(false))
    return () => controller.abort()
  }, [slug])

  if (loading) return <main className="page-shell"><SiteHeader /><div className="detail-state">Opening the event…</div></main>
  if (error || !event) return (
    <main className="page-shell">
      <SiteHeader />
      <div className="detail-state"><p>{error || 'This event could not be found.'}</p><Link to="/" className="text-link"><ArrowLeft size={15} /> Back to weekends</Link></div>
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
    <main className="page-shell detail-page">
      <SiteHeader />
      <Link to="/" className="back-link"><ArrowLeft size={14} /> All weekends</Link>
      {event.banner_url && <div className="detail-banner"><img src={event.banner_url} alt={`${event.name} banner`} /></div>}
      <section className="detail-hero">
        <p className="section-eyebrow"><span className="kicker-line" />{event.event_type || 'COMMUNITY EVENT'}</p>
        <h1>{event.name}</h1>
        <div className="detail-facts">
          {date && <span><CalendarDays size={15} />{formatEventDate(date, event.timezone)}</span>}
          <span><Clock3 size={15} />{startTime ? `${startTime}${endTime ? ` – ${endTime}` : ''}` : 'Time to be confirmed'}</span>
          {(venue || event.attendance_mode === 'online') && <span><MapPin size={15} />{venue || 'Online'}</span>}
        </div>
        <div className="detail-organizer">
          <span>ORGANIZED BY</span>
          {event.organizer_website
            ? <a href={event.organizer_website} target="_blank" rel="noreferrer">{event.organizer_name || 'Community'} <ArrowUpRight size={13} /></a>
            : <strong>{event.organizer_name || 'Community'}</strong>}
        </div>
        {event.registration_url && <a className="register-button" href={event.registration_url} target="_blank" rel="noreferrer">Register for this Event <ArrowUpRight size={16} /></a>}
      </section>

      <div className="detail-content">
        {event.description && <Section title="ABOUT"><div className="description-copy">{event.description.split(/\n{2,}/).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div></Section>}
        {speakers.length > 0 && <Section title="SPEAKERS"><div className="speaker-list">{speakers.map((speaker, index) => <article className="speaker-item" key={speaker.id || index}>{speaker.image_url && <img src={speaker.image_url} alt="" loading="lazy" /> }<div><h3>{speaker.name}</h3><p>{[speaker.role, speaker.organization].filter(Boolean).join(' · ')}</p>{speaker.biography && <p className="speaker-bio">{speaker.biography}</p>}</div></article>)}</div></Section>}
        {agenda.length > 0 && <Section title="THE AGENDA"><div className="agenda-list">{agenda.map((item, index) => <article className="agenda-item" key={item.id || index}><div className="agenda-time">{[item.start_time, item.end_time].filter(Boolean).map((time) => formatEventTimeInIndia({ start_time: time }, 'start')).join(' – ') || '—'}</div><div><h3>{item.title}</h3>{item.speaker_name && <span className="agenda-speaker">{item.speaker_name}</span>}{item.description && <p>{item.description}</p>}</div></article>)}</div></Section>}
        {event.organizer_name && <Section title="THE ORGANIZERS"><div className="organizer-block"><h3>{event.organizer_name}</h3>{event.organizer_website && <a href={event.organizer_website} target="_blank" rel="noreferrer">{event.organizer_website} <ArrowUpRight size={14} /></a>}</div></Section>}
        {sponsors.length > 0 && <Section title="WITH THANKS TO"><div className="sponsor-list">{sponsors.map((sponsor, index) => <a key={sponsor.id || index} href={sponsor.website || undefined} target="_blank" rel="noreferrer">{sponsor.logo_url && <img src={sponsor.logo_url} alt="" loading="lazy" />}<span>{sponsor.name}</span></a>)}</div></Section>}
        {venue && <Section title="WHERE"><p className="venue-copy">{venue}</p>{event.online_details && <p className="venue-copy">{event.online_details}</p>}</Section>}
        {event.registration_url && <Section title="JOIN US"><div className="registration-panel"><div><p>Make it part of your weekend.</p><span>Visit the original event page to find your place.</span></div><a href={event.registration_url} target="_blank" rel="noreferrer">Register <ArrowUpRight size={16} /></a></div></Section>}
        {event.source_url && <div className="source-link"><span>ORIGINAL EVENT PAGE</span><a href={event.source_url} target="_blank" rel="noreferrer">{(() => { try { return new URL(event.source_url).hostname } catch { return 'Visit source' } })()} <ArrowUpRight size={13} /></a></div>}
      </div>
      <footer className="site-footer detail-footer"><Link to="/" className="text-link"><ArrowLeft size={15} /> Back to the weekend</Link><span className="footer-meta">the orbit®</span></footer>
    </main>
  )
}
