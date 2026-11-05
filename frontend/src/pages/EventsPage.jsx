import { useMemo } from 'react'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { addDays, format, isSaturday, isValid, parseISO } from 'date-fns'
import { WeekendEvents } from '../components/WeekendEvents.jsx'
import { useWeekendEvents } from '../hooks/useWeekendEvents.js'
import { useSeo } from '../seo/useSeo.js'
import { formatWeekendRange, getNextWeekend, localDateString, shiftWeekend } from '../utils/weekends.js'

const UPCOMING_TABS = 5

function weekendFromParam(value, current) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return current
  const start = parseISO(value)
  if (!isValid(start) || !isSaturday(start) || start < current.start) return current
  return { start, end: addDays(start, 1) }
}

function weekendHref(weekend) {
  return `/events?weekend=${localDateString(weekend.start)}`
}

export function EventsPage() {
  const [searchParams] = useSearchParams()
  const current = getNextWeekend()
  const currentKey = localDateString(current.start)
  const weekendParam = searchParams.get('weekend')
  const weekend = useMemo(
    () => weekendFromParam(weekendParam, getNextWeekend()),
    // currentKey changes when the calendar rolls over to a new weekend.
    [weekendParam, currentKey],
  )
  const isCurrent = localDateString(weekend.start) === currentKey
  const { events, loading, error, retry } = useWeekendEvents(weekend)
  const tabs = Array.from({ length: UPCOMING_TABS }, (_, index) => shiftWeekend(current, index))
  const previous = shiftWeekend(weekend, -1)
  const next = shiftWeekend(weekend, 1)
  const range = formatWeekendRange(weekend)

  useSeo({
    title: isCurrent
      ? 'Tech events in Hyderabad this weekend · The Orbit'
      : `Tech events in Hyderabad, ${range} · The Orbit`,
    description: `Meetups, workshops, hackathons and talks in Hyderabad${isCurrent ? ' this weekend' : ''}, ${range}. Grouped by day with times in IST, venues and registration links.`,
    path: isCurrent ? '/events' : weekendHref(weekend),
  })

  return (
    <>
      <section className="tone-dark o-page-hero" aria-labelledby="events-title">
        <div className="o-wrap">
          <p className="o-label">Weekend guide</p>
          <h1 id="events-title" className="o-h1">Tech events in Hyderabad, weekend by weekend.</h1>
          <p className="o-lead">
            Meetups, workshops, hackathons and talks, grouped by day and ordered by start time.
            All times are in IST. Choose a weekend to see what’s planned.
          </p>

          <nav className="o-weekend-nav" aria-label="Choose a weekend">
            <ul className="o-weekend-tabs">
              {tabs.map((tab, index) => {
                const key = localDateString(tab.start)
                const active = key === localDateString(weekend.start)
                return (
                  <li key={key}>
                    <Link
                      to={weekendHref(tab)}
                      className={`o-weekend-tab${active ? ' is-active' : ''}`}
                      aria-current={active ? 'true' : undefined}
                    >
                      <span>{index === 0 ? 'This weekend' : index === 1 ? 'Next weekend' : format(tab.start, 'MMMM')}</span>
                      <strong>{formatWeekendRange(tab)}</strong>
                    </Link>
                  </li>
                )
              })}
            </ul>
            <div className="o-weekend-step">
              {isCurrent ? (
                <span className="o-icon-button is-disabled" aria-hidden="true"><ArrowLeft size={16} /></span>
              ) : (
                <Link className="o-icon-button" to={weekendHref(previous)} aria-label={`Previous weekend, ${formatWeekendRange(previous)}`}>
                  <ArrowLeft size={16} aria-hidden="true" />
                </Link>
              )}
              <Link className="o-icon-button" to={weekendHref(next)} aria-label={`Next weekend, ${formatWeekendRange(next)}`}>
                <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </div>
          </nav>
        </div>
      </section>

      <section className="tone-light o-section o-section-tight" aria-labelledby="weekend-range-title">
        <div className="o-wrap">
          <header className="o-listing-head">
            <h2 id="weekend-range-title">
              {format(weekend.start, 'd')}–{format(weekend.end, 'd MMMM yyyy')}
            </h2>
            {!loading && !error && (
              <p className="o-label">
                {events.length === 0 ? 'Nothing listed yet' : `${events.length} ${events.length === 1 ? 'event' : 'events'} listed`}
              </p>
            )}
          </header>

          {error ? (
            <div className="o-state" role="alert">
              <p className="o-state-title">Events couldn’t be loaded.</p>
              <p>Check your connection and try again.</p>
              <button type="button" className="o-button o-button-dark" onClick={retry}>Try again</button>
            </div>
          ) : loading ? (
            <p className="o-loading" role="status"><span aria-hidden="true" />Loading events for {formatWeekendRange(weekend)}</p>
          ) : events.length > 0 ? (
            <WeekendEvents events={events} weekend={weekend} />
          ) : (
            <div className="o-state">
              <p className="o-state-title">No events listed for this weekend yet.</p>
              <p>New events are added through the week, so check back soon. In the meantime, see what’s planned next.</p>
              <Link className="o-button o-button-dark" to={weekendHref(next)}>
                {formatWeekendRange(next)} <ArrowRight size={15} aria-hidden="true" />
              </Link>
            </div>
          )}
        </div>
      </section>
    </>
  )
}
