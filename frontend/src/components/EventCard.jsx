import { ArrowUpRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { eventDateInIndia, formatEventTimeInIndia, formatIndiaDate } from '../utils/times.js'
import { eventTimingStatus } from '../utils/eventStatus.js'
import { registrationStatusInfo } from '../utils/registrationStatus.js'
import { EventArtwork } from './OrbitRings.jsx'
import { EventImage } from './EventImage.jsx'

export function EventCard({ event }) {
  const dateKey = eventDateInIndia(event)
  const date = dateKey ? formatIndiaDate(dateKey, { weekday: 'short', day: 'numeric', month: 'short' }) : ''
  const time = formatEventTimeInIndia(event).replace(/^0/, '')
  const organizer = event.organizer_name?.trim()
  const type = event.event_type?.trim() || 'Tech event'
  const name = event.name?.trim() || 'Untitled event'
  const status = eventTimingStatus(event)
  // Registration availability is irrelevant once an event has ended.
  const registration = status?.key === 'ended' ? null : registrationStatusInfo(event.registration_status)
  const objectPosition = event.banner_object_position || event.image_position || 'center'

  return (
    <Link to={`/events/${event.slug}`} className={`o-card${status?.key === 'ended' ? ' is-ended' : ''}`}>
      <div className="o-card-media">
        <EventImage src={event.banner_url} width={800} adaptive objectPosition={objectPosition} fallback={<EventArtwork />} />
        {status && <span className={`o-card-status is-${status.key}`}>{status.label}</span>}
      </div>
      <div className="o-card-body">
        <p className="o-card-when">
          {date && <span>{date}</span>}
          <span>{time || 'Time TBC'}</span>
        </p>
        <h3 className="o-card-title">{name}</h3>
        <p className={`o-card-org${organizer ? '' : ' is-muted'}`}>{organizer || 'Organiser to be announced'}</p>
        <p className="o-card-foot">
          <span className="o-card-meta">
            <span className="o-card-type">{type}</span>
            {registration && <span className={`o-card-reg is-${registration.key}`}><i aria-hidden="true" />{registration.label}</span>}
          </span>
          <ArrowUpRight className="o-card-arrow" size={15} strokeWidth={1.5} aria-hidden="true" />
        </p>
      </div>
    </Link>
  )
}
