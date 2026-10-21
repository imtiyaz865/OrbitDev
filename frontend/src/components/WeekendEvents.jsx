import { format } from 'date-fns'
import { localDateString } from '../utils/weekends.js'
import { EventCard } from './EventCard.jsx'

function eventDate(event) {
  return event.start_date || event.start_at?.slice(0, 10) || ''
}

function EventGrid({ events }) {
  return (
    <div className="day-events">
      {events.map((event, index) => (
        <EventCard event={event} key={event.id || event.slug} />
      ))}
    </div>
  )
}

export function WeekendEvents({ events, weekend }) {
  const saturday = localDateString(weekend.start)
  const sunday = localDateString(weekend.end)
  const days = [
    { date: saturday, label: 'Saturday', dateObject: weekend.start },
    { date: sunday, label: 'Sunday', dateObject: weekend.end },
  ]
  const sorted = [...events].sort((a, b) => {
    const dateOrder = eventDate(a).localeCompare(eventDate(b))
    return dateOrder || (a.start_time || '99:99').localeCompare(b.start_time || '99:99')
  })

  return (
    <div className="weekend-groups">
      {days.map((day) => {
        const dayEvents = sorted.filter((event) => eventDate(event) === day.date)
        const timed = dayEvents.filter((event) => event.start_time)
        const untimed = dayEvents.filter((event) => !event.start_time)
        return (
          <section className="day-section" key={day.date} aria-labelledby={`day-${day.date}`}>
            <header className="day-heading">
              <div className="day-heading-copy">
                <span className="day-name" id={`day-${day.date}`}>{day.label}</span>
                <span className="day-date">{format(day.dateObject, 'd MMMM')}</span>
              </div>
              <span className="day-count">{dayEvents.length} {dayEvents.length === 1 ? 'event' : 'events'}</span>
            </header>
            {dayEvents.length === 0 ? (
              <p className="day-empty">A little room for something unexpected.</p>
            ) : (
              <div className="day-collection">
                <EventGrid events={timed} />
                {untimed.length > 0 && (
                  <div className="unconfirmed-group">
                    <p className="unconfirmed-label">Time to be confirmed</p>
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
