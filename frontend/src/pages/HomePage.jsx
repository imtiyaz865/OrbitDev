import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, ArrowUpRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { format, isSameDay } from 'date-fns'
import { SiteHeader } from '../components/SiteHeader.jsx'
import { ScrollReveal } from '../components/ScrollReveal.jsx'
import { WeekendEvents } from '../components/WeekendEvents.jsx'
import { api } from '../services/api.js'
import { formatWeekendRange, getNextWeekend, localDateString, shiftWeekend } from '../utils/weekends.js'

export function HomePage() {
  const [weekend, setWeekend] = useState(() => getNextWeekend())
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const currentWeekend = getNextWeekend()
  const isCurrent = isSameDay(weekend.start, currentWeekend.start)
  const weekendMonths = format(weekend.start, 'MMM') === format(weekend.end, 'MMM')
    ? format(weekend.start, 'MMM')
    : `${format(weekend.start, 'MMM')} — ${format(weekend.end, 'MMM')}`
  const weekendYears = format(weekend.start, 'yyyy') === format(weekend.end, 'yyyy')
    ? format(weekend.start, 'yyyy')
    : `${format(weekend.start, 'yyyy')}–${format(weekend.end, 'yyyy')}`
  const label = `${formatWeekendRange(weekend)}, ${weekendYears}`.toUpperCase()

  const loadEvents = useCallback(async (signal) => {
    setLoading(true)
    setError('')
    try {
      const result = await api.getWeekendEvents(
        localDateString(weekend.start),
        localDateString(weekend.end),
        signal,
      )
      setEvents(Array.isArray(result) ? result : result.events || [])
    } catch (err) {
      if (err.name !== 'AbortError') {
        setError(err.message || 'Events could not be loaded.')
        setEvents([])
      }
    } finally {
      setLoading(false)
    }
  }, [weekend])

  useEffect(() => {
    const controller = new AbortController()
    loadEvents(controller.signal)
    return () => controller.abort()
  }, [loadEvents])

  return (
    <main>
      <div className="page-shell">
        <SiteHeader />
        <section className="hero">
          <ScrollReveal className="hero-editorial">
            <div className="hero-kicker"><span className="kicker-line" />THE WEEKEND EDITION</div>
            <h1 className="hero-title"><span>You are in</span><br /><em>The Orbit.</em></h1>
            <p className="hero-copy">Hyderabad&apos;s people, ideas, and technology — all in one orbit.</p>
            <a className="hero-scroll" href="#weekend-list" aria-label="Explore this weekend’s events">
              Explore this weekend <ArrowRight size={16} />
            </a>
          </ScrollReveal>
          <ScrollReveal as="aside" className="hero-weekend-card" aria-label={`Upcoming weekend, ${label}`}>
            <span>UP NEXT</span>
            <strong>{format(weekend.start, 'dd')}<i>—</i>{format(weekend.end, 'dd')}</strong>
            <div><b>{weekendMonths}</b><span>{format(weekend.start, 'EEEE')} <i /> {format(weekend.end, 'EEEE')}</span></div>
            <small>{weekendYears} · WEEKEND EVENTS</small>
          </ScrollReveal>
        </section>

        <section className="weekend-section" id="weekend-list">
          <div className="section-topline">
            <span>DISCOVER</span>
            <span>ISSUE {format(weekend.start, 'ww')} <i /> {format(weekend.start, 'yyyy')}</span>
          </div>
          <div className="weekend-heading">
            <div>
              <p className="section-eyebrow"><span className="live-dot" />{isCurrent ? 'THIS WEEKEND' : 'UP NEXT'} · {label}</p>
              <h2>Find your<br className="mobile-break" /> <em>people.</em></h2>
            </div>
            <div className="weekend-controls">
              <button
                className="weekend-control"
                onClick={() => setWeekend((current) => shiftWeekend(current, -1))}
                disabled={isCurrent}
                aria-label="Previous weekend"
              ><ArrowLeft size={16} /></button>
              <button
                className="weekend-control"
                onClick={() => setWeekend((current) => shiftWeekend(current, 1))}
                aria-label="Next weekend"
              ><ArrowRight size={16} /></button>
            </div>
          </div>

          {error ? (
            <div className="state-message state-error">
              <p>We couldn’t reach the event list.</p>
              <span>{error}</span>
              <button onClick={() => loadEvents()}>Try again <ArrowUpRight size={14} /></button>
            </div>
          ) : loading ? (
            <div className="state-loading" aria-live="polite"><span className="loading-line" />Finding this weekend</div>
          ) : events.length > 0 ? (
            <WeekendEvents events={events} weekend={weekend} />
          ) : (
            <ScrollReveal className="empty-state">
              <span className="empty-index">A little breathing room</span>
              <h3>No events<br /><em>this weekend.</em></h3>
              <p>Take a look at what’s coming up next.</p>
              <button className="text-link" onClick={() => setWeekend((current) => shiftWeekend(current, 1))}>
                See next weekend <ArrowUpRight size={15} />
              </button>
            </ScrollReveal>
          )}
        </section>

        <ScrollReveal as="section" className="community-invitation" aria-labelledby="community-title">
          <span className="community-eyebrow"><span className="kicker-line" />THE PEOPLE BEHIND THE IDEAS</span>
          <h2 id="community-title">Good things happen<br />in <em>orbit.</em></h2>
          <p>Meet the people building, learning, and creating Hyderabad&apos;s next big thing.</p>
          <Link className="community-cta" to="/community">
            Find your people <ArrowUpRight size={18} />
          </Link>
          <span className="community-index" aria-hidden="true">HYD · 17°23&apos;N 78°29&apos;E</span>
        </ScrollReveal>

        <footer className="site-footer">
          <div className="footer-wordmark">the orbit<span>®</span></div>
          <p>Good things happen when we get together.</p>
          <span className="footer-meta">A living guide to the technology community.</span>
        </footer>
      </div>
    </main>
  )
}
