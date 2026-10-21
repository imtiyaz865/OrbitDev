import { useEffect, useState } from 'react'
import { ArrowUpRight, CalendarDays, Clock3, MapPin, Wallet } from 'lucide-react'
import { Link } from 'react-router-dom'
import { eventDateInIndia, formatEventTimeInIndia, formatIndiaDate } from '../utils/times.js'

export function EventCard({ event }) {
  const [imageFailed, setImageFailed] = useState(false)
  const showImage = Boolean(event.banner_url) && !imageFailed
  const date = eventDateInIndia(event)
  const time = formatEventTimeInIndia(event)
  const endTime = formatEventTimeInIndia(event, 'end')
  const location = event.attendance_mode === 'online'
    ? 'Online'
    : [event.venue_name, event.city].filter(Boolean).join(' · ')
  const admission = event.registration_fee_type === 'free'
    ? 'Free'
    : event.registration_amount
      ? `${event.registration_currency || '₹'} ${event.registration_amount}`
      : ''

  useEffect(() => setImageFailed(false), [event.banner_url])

  return (
    <Link to={`/events/${event.slug}`} className="event-card" aria-label={`View ${event.name}`}>
      <div className={`event-card-visual${showImage ? '' : ' is-placeholder'}`}>
        {showImage
          ? <img src={event.banner_url} alt="" width="640" height="400" loading="lazy" style={{ objectPosition: event.banner_object_position || event.image_position || 'center' }} onError={() => setImageFailed(true)} />
          : <span aria-hidden="true">ORBIT / EVENT</span>}
        {event.event_type && <span className="event-card-type">{event.event_type}</span>}
      </div>
      <div className="event-card-body">
        <div className="event-card-title-row">
          <h3>{event.name}</h3>
          <ArrowUpRight className="event-card-arrow" size={17} aria-hidden="true" />
        </div>
        <div className="event-card-meta">
          {date && <span><CalendarDays size={13} aria-hidden="true" />{formatIndiaDate(date, { weekday: 'short', day: 'numeric', month: 'short' })}</span>}
          {time && <span><Clock3 size={13} aria-hidden="true" />{time}{endTime ? ` – ${endTime}` : ''}</span>}
          {location && <span><MapPin size={13} aria-hidden="true" />{location}</span>}
          {admission && <span className="event-card-admission"><Wallet size={13} aria-hidden="true" />{admission}</span>}
        </div>
      </div>
    </Link>
  )
}
