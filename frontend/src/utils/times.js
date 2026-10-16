import { zonedDateTimeToIso } from './weekends.js'

export const INDIA_TIME_ZONE = 'Asia/Kolkata'

export function parseTimeInput(value) {
  if (typeof value !== 'string') return ''
  const normalized = value.trim()
  const twelveHour = normalized.match(/^(\d{1,2})(?::([0-5]\d))?\s*(AM|PM)$/i)
  if (twelveHour) {
    const hour = Number(twelveHour[1])
    if (hour < 1 || hour > 12) return ''
    const minute = twelveHour[2] || '00'
    const hour24 = (hour % 12) + (twelveHour[3].toUpperCase() === 'PM' ? 12 : 0)
    return `${String(hour24).padStart(2, '0')}:${minute}`
  }
  const twentyFourHour = normalized.match(/^([01]\d|2[0-3]):([0-5]\d)(?::00(?:\.0{1,6})?)?$/)
  return twentyFourHour ? `${twentyFourHour[1]}:${twentyFourHour[2]}` : ''
}

export function format12HourTime(value) {
  const normalized = parseTimeInput(String(value ?? ''))
  if (!normalized) return ''
  const [hourText, minute] = normalized.split(':')
  const hour = Number(hourText)
  return `${String(hour % 12 || 12).padStart(2, '0')}:${minute} ${hour < 12 ? 'AM' : 'PM'}`
}

function dateTimeParts(instant, timeZone = INDIA_TIME_ZONE) {
  if (!instant || Number.isNaN(Date.parse(instant))) return null
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(instant)).map(({ type, value }) => [type, value]))
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  }
}

function instantFromLocal(event, dateKey, timeKey, instantKey) {
  if (event[instantKey]) return event[instantKey]
  const date = event[dateKey]
  const time = parseTimeInput(String(event[timeKey] ?? ''))
  if (!date || !time) return null
  const sourceTimeZone = event.timezone || INDIA_TIME_ZONE
  try {
    return zonedDateTimeToIso(date, time, sourceTimeZone)
  } catch {
    return null
  }
}

export function eventDateTimeInIndia(event, edge = 'start') {
  const prefix = edge === 'end' ? 'end' : 'start'
  const instant = instantFromLocal(event, `${prefix}_date`, `${prefix}_time`, `${prefix}_at`)
  if (instant) return dateTimeParts(instant)
  const date = event[`${prefix}_date`] || null
  const time = parseTimeInput(String(event[`${prefix}_time`] ?? ''))
  return date ? { date, time } : null
}

export function eventDateInIndia(event) {
  return eventDateTimeInIndia(event)?.date || null
}

export function eventTimeInIndia(event, edge = 'start') {
  return eventDateTimeInIndia(event, edge)?.time || ''
}

export function formatEventTimeInIndia(event, edge = 'start') {
  return format12HourTime(eventTimeInIndia(event, edge))
}

export function formatIndiaDate(dateString, options = { weekday: 'short', day: 'numeric', month: 'short' }) {
  if (!dateString || !/^\d{4}-\d{2}-\d{2}$/.test(dateString)) return ''
  const date = new Date(`${dateString}T12:00:00.000Z`)
  return new Intl.DateTimeFormat('en-IN', { ...options, timeZone: INDIA_TIME_ZONE }).format(date)
}
