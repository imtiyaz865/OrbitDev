import { format } from 'date-fns'
import { localDateString } from '../utils/weekends.js'
import { EventCard } from './EventCard.jsx'

function eventDate(event) {
  return event.start_date || event.start_at?.slice(0, 10) || ''
}

function EventGrid({ events }) {
  return (
    <div className="o-grid">
      {events.map((event) => <EventCard event={event} key={event.id || event.slug} />)}
    </div>
  )
}

export function WeekendEvents({ events, weekend }) {
  const days = [
    { date: localDateString(weekend.start), label: 'Saturday', dateObject: weekend.start },
    { date: localDateString(weekend.end), label: 'Sunday', dateObject: weekend.end },
  ]
  const sorted = [...events].sort((a, b) => (
    eventDate(a).localeCompare(eventDate(b))
    || (a.start_time || '99:99').localeCompare(b.start_time || '99:99')
  ))

  return (
    <div className="o-days">
      {days.map((day) => {
        const dayEvents = sorted.filter((event) => eventDate(event) === day.date)
        const timed = dayEvents.filter((event) => event.start_time || event.start_at)
        const untimed = dayEvents.filter((event) => !event.start_time && !event.start_at)
        return (
          <section className="o-day" key={day.date} aria-labelledby={`day-${day.date}`}>
            <header className="o-day-head">
              <h3 id={`day-${day.date}`}>
                {day.label}
                <span>{format(day.dateObject, 'd MMMM')}</span>
              </h3>
              <span className="o-day-count">
                {dayEvents.length} {dayEvents.length === 1 ? 'event' : 'events'}
              </span>
            </header>
            {dayEvents.length === 0 ? (
              <p className="o-day-empty">No events listed for {day.label} yet.</p>
            ) : (
              <div className="o-day-body">
                {timed.length > 0 && <EventGrid events={timed} />}
                {untimed.length > 0 && (
                  <div className="o-day-untimed">
                    <p className="o-label">Time to be announced</p>
                    <EventGrid events={untimed} />
                  </div>
                )}
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}
