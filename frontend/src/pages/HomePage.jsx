import { ArrowRight, ArrowUpRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { EventCard } from '../components/EventCard.jsx'
import { OrbitRings } from '../components/OrbitRings.jsx'
import { StarField } from '../components/StarField.jsx'
import { siteJsonLd, useSeo } from '../seo/useSeo.js'
import { UpdatesCta } from '../components/SiteHeader.jsx'
import { useWeekendEvents } from '../hooks/useWeekendEvents.js'
import { formatWeekendRange, getNextWeekend, localDateString, shiftWeekend } from '../utils/weekends.js'

const PREVIEW_COUNT = 4

const principles = [
  {
    index: '01',
    title: 'Every event in one guide',
    body: 'Hyderabad’s tech events are spread across ticketing sites, community pages and group chats. We collect them into a single weekly guide you can scan in a minute.',
  },
  {
    index: '02',
    title: 'The details you need to decide',
    body: 'Date, time in IST, format, venue, organiser and a direct link to register. No account needed to browse.',
  },
  {
    index: '03',
    title: 'Plan weeks ahead',
    body: 'Look beyond this Saturday. Browse upcoming weekends and register before seats fill up.',
  },
]

function WeekendPreview() {
  const weekend = getNextWeekend()
  const { events, loading, error, retry } = useWeekendEvents(weekend)
  const preview = events.slice(0, PREVIEW_COUNT)
  const nextWeekend = localDateString(shiftWeekend(weekend, 1).start)

  return (
    <section className="tone-light o-section" id="weekend-list" aria-labelledby="weekend-title">
      <div className="o-wrap">
        <header className="o-section-head">
          <div>
            <p className="o-label">This weekend · {formatWeekendRange(weekend)}</p>
            <h2 id="weekend-title" className="o-h2">Tech events happening in Hyderabad this weekend</h2>
          </div>
          {!loading && !error && events.length > 0 && (
            <Link className="o-link" to="/events">
              {events.length > PREVIEW_COUNT ? `View all ${events.length} events` : 'Open the weekend guide'}
              <ArrowRight size={15} strokeWidth={1.5} aria-hidden="true" />
            </Link>
          )}
        </header>

        {error ? (
          <div className="o-state" role="alert">
            <p className="o-state-title">Events couldn’t be loaded.</p>
            <p>Check your connection and try again.</p>
            <button type="button" className="o-button o-button-dark" onClick={retry}>Try again</button>
          </div>
        ) : loading ? (
          <p className="o-loading" role="status"><span aria-hidden="true" />Loading this weekend’s events</p>
        ) : preview.length > 0 ? (
          <div className="o-grid">
            {preview.map((event) => <EventCard key={event.id || event.slug} event={event} />)}
          </div>
        ) : (
          <div className="o-state">
            <p className="o-state-title">No events listed for this weekend yet.</p>
            <p>New events are added through the week. In the meantime, see what’s planned for {formatWeekendRange(shiftWeekend(weekend, 1))}.</p>
            <Link className="o-button o-button-dark" to={`/events?weekend=${nextWeekend}`}>
              View next weekend <ArrowRight size={15} strokeWidth={1.5} aria-hidden="true" />
            </Link>
          </div>
        )}
      </div>
    </section>
  )
}

export function HomePage() {
  useSeo({ path: '/', jsonLd: siteJsonLd() })
  return (
    <>
      <section className="tone-dark o-hero" aria-labelledby="home-title">
        <StarField seed={7} />
        <OrbitRings className="o-hero-rings" />
        <div className="o-wrap">
          <div className="o-hero-text">
            <p className="o-label">Hyderabad · Weekly tech event guide</p>
            <h1 id="home-title" className="o-h1">
              Hyderabad’s tech events, <em>in one place.</em>
            </h1>
            <p className="o-lead">
              The Orbit lists the meetups, workshops, hackathons and talks happening across the city
              every weekend, with times, venues and registration links. Follow along for updates from
              Hyderabad’s tech community.
            </p>
            <div className="o-actions">
              <Link className="o-button o-button-light" to="/events">
                Browse this weekend <ArrowRight size={16} strokeWidth={1.5} aria-hidden="true" />
              </Link>
              <UpdatesCta className="o-link" label="Get weekly updates" />
            </div>
          </div>
        </div>
      </section>

      <WeekendPreview />

      <section className="tone-dark o-section" aria-labelledby="why-title">
        <div className="o-wrap o-split">
          <header className="o-split-aside">
            <p className="o-label">Why The Orbit</p>
            <h2 id="why-title" className="o-h2">Less time searching. More time at the events that matter.</h2>
          </header>
          <ol className="o-rows">
            {principles.map((item) => (
              <li key={item.index} className="o-row">
                <span className="o-row-index">{item.index}</span>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="tone-light o-section o-band" aria-labelledby="home-community-title">
        <div className="o-wrap o-band-grid">
          <div>
            <p className="o-label">Community</p>
            <h2 id="home-community-title" className="o-h2 o-h2-lg">
              Find the events. <em>Meet the people behind them.</em>
            </h2>
          </div>
          <div className="o-band-body">
            <p>
              Every listing is run by a local community: developer groups, startup circles, design
              collectives and university clubs. The Orbit helps you find them, show up, and stay
              connected after the event ends.
            </p>
            <Link className="o-button o-button-dark" to="/community">
              Join the community <ArrowUpRight size={16} strokeWidth={1.5} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>
    </>
  )
}
