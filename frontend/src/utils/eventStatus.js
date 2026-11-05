import { indiaDateString } from './weeklyUpdate.js'
import { eventDateInIndia } from './times.js'

/**
 * Derives a timing label from the event's own dates. Returns null when
 * nothing useful can be said, so cards never show an invented status.
 */
export function eventTimingStatus(event, now = new Date()) {
  const start = event.start_at ? new Date(event.start_at) : null
  const end = event.end_at ? new Date(event.end_at) : null
  if (start && end && !Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
    if (now >= end) return { key: 'ended', label: 'Ended' }
    if (now >= start) return { key: 'live', label: 'Happening now' }
  }
  const date = eventDateInIndia(event)
  if (!date) return null
  const today = indiaDateString(now)
  if (date < today) return { key: 'ended', label: 'Ended' }
  if (date === today) return { key: 'today', label: 'Today' }
  return null
}
