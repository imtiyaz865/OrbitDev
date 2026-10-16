import { useEffect, useState } from 'react'
import { ArrowUpRight, CalendarDays, Clock3, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import { eventDateInIndia, formatEventTimeInIndia, formatIndiaDate } from '../utils/times.js'

function formatDate(event) {
  return formatIndiaDate(eventDateInIndia(event))
}

function formatTime(event) {
  const start = formatEventTimeInIndia(event)
  if (!start) return 'Time to be confirmed'
  const end = formatEventTimeInIndia(event, 'end')
  return end ? `${start} – ${end}` : start
}

export function EventCard({ event, index = 0 }) {
  const [imageFailed, setImageFailed] = useState(false)
  const showImage = Boolean(event.banner_url) && !imageFailed
  const date = formatDate(event)
  const organizer = event.organizer_name?.trim()
  const objectPosition = event.banner_object_position || event.image_position || 'center'

  useEffect(() => {
    setImageFailed(false)
  }, [event.banner_url])

  return (
    <Link
      to={`/events/${event.slug}`}
      className={`event-card${showImage ? ' event-card-image' : ''}`}
      aria-label={event.name}
    >
      <div className="event-card-visual">
        {showImage ? (
          <img
            src={event.banner_url}
            alt=""
            loading="lazy"
            style={{ objectPosition }}
            onError={() => setImageFailed(true)}
          />
        ) : (
          <div className="event-card-monogram" aria-hidden="true">
            <span>THE ORBIT / {String(index + 1).padStart(2, '0')}</span>
            <strong>{(event.event_type || 'EVENT').slice(0, 1).toUpperCase()}</strong>
          </div>
        )}
        <span className="event-card-type">{event.event_type || 'Event'}</span>
      </div>
      <div className="event-card-body">
        <div className="event-card-title-row">
          <h3>{event.name}</h3>
          <span className="event-card-arrow" aria-hidden="true">
            <ArrowUpRight size={18} strokeWidth={1.6} />
          </span>
        </div>
        <div className="event-card-meta">
          {date && (
            <span>
              <CalendarDays size={14} strokeWidth={1.7} aria-hidden="true" />
              {date}
            </span>
          )}
          <span>
            <Clock3 size={14} strokeWidth={1.7} aria-hidden="true" />
            {formatTime(event)}
          </span>
          <span className={organizer ? '' : 'event-card-meta-muted'}>
            <Users size={14} strokeWidth={1.7} aria-hidden="true" />
            {organizer || 'Organizer to be confirmed'}
          </span>
        </div>
      </div>
    </Link>
  )
}
