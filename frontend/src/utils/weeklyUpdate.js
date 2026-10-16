import { eventDateTimeInIndia, format12HourTime, INDIA_TIME_ZONE } from './times.js'

function dateParts(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return null
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
  return { year, month, day, date }
}

export function indiaDateString(instant = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: INDIA_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant).map(({ type, value }) => [type, value]))
  return `${parts.year}-${parts.month}-${parts.day}`
}

export function shiftDateString(dateString, amount) {
  const parts = dateParts(dateString)
  if (!parts) throw new Error('Enter a valid date.')
  parts.date.setUTCDate(parts.date.getUTCDate() + amount)
  return parts.date.toISOString().slice(0, 10)
}

export function defaultIndiaWeekend(now = new Date()) {
  const today = indiaDateString(now)
  const parts = dateParts(today)
  const day = parts.date.getUTCDay()
  const daysUntilSaturday = day === 6 ? 0 : day === 0 ? -1 : 6 - day
  const start = shiftDateString(today, daysUntilSaturday)
  return { start, end: shiftDateString(start, 1) }
}

function rangeTitle(start, end) {
  const startParts = dateParts(start)
  const endParts = dateParts(end)
  if (!startParts || !endParts) return 'EVENTS'
  const startMonth = new Intl.DateTimeFormat('en', { month: 'long', timeZone: 'UTC' }).format(startParts.date).toUpperCase()
  const endMonth = new Intl.DateTimeFormat('en', { month: 'long', timeZone: 'UTC' }).format(endParts.date).toUpperCase()
  const isWeekend = startParts.date.getUTCDay() === 6
    && endParts.date.getUTCDay() === 0
    && endParts.date.getTime() - startParts.date.getTime() === 86_400_000
  if (isWeekend && startParts.year === endParts.year && startParts.month === endParts.month) {
    return `WEEKEND EVENTS — ${startParts.day}–${endParts.day} ${endMonth} ${endParts.year}`
  }
  if (isWeekend && startParts.year === endParts.year) {
    return `WEEKEND EVENTS — ${startParts.day} ${startMonth}–${endParts.day} ${endMonth} ${endParts.year}`
  }
  if (isWeekend) {
    return `WEEKEND EVENTS — ${startParts.day} ${startMonth} ${startParts.year}–${endParts.day} ${endMonth} ${endParts.year}`
  }
  return `EVENTS — ${startParts.day} ${startMonth}–${endParts.day} ${endMonth} ${endParts.year}`
}

function isCancelled(event) {
  return /cancelled|canceled/i.test(event.registration_status || '')
    || ['cancelled', 'canceled'].includes(String(event.status || '').toLowerCase())
}

function venueFor(event) {
  if (event.attendance_mode === 'online') return event.online_details ? `Online · ${event.online_details}` : 'Online event'
  const address = [event.address, event.city].filter(Boolean)
  const venue = event.venue_name?.trim()
  if (event.attendance_mode === 'mixed') {
    const inPerson = [venue, ...address].filter(Boolean).join(', ') || 'In-person venue not confirmed'
    return `Hybrid · ${inPerson} · ${event.online_details ? `Online · ${event.online_details}` : 'Online details not confirmed'}`
  }
  return [venue, ...address].filter(Boolean).join(', ') || 'Venue not confirmed'
}

export function createWeeklyUpdate(events, { startDate, endDate, includePast = false, today = indiaDateString() }) {
  if (!dateParts(startDate) || !dateParts(endDate) || startDate > endDate) {
    throw new Error('Choose a valid date range.')
  }

  const upcoming = []
  const dateNeedsReview = []
  for (const event of events) {
    if (event.status !== 'published' || isCancelled(event)) continue
    const schedule = eventDateTimeInIndia(event)
    if (!schedule?.date || !dateParts(schedule.date)) {
      const hasVenue = Boolean(event.venue_name || event.address || event.city) || event.attendance_mode === 'online'
      dateNeedsReview.push({ event, date: null, time: schedule?.time || '', endTime: '', venue: venueFor(event), missing: ['date', ...(!schedule?.time ? ['time'] : []), ...(!hasVenue ? ['venue'] : [])] })
      continue
    }
    if (schedule.date < startDate || schedule.date > endDate) continue
    if (!includePast && schedule.date < today) continue
    const endTime = eventDateTimeInIndia(event, 'end')?.time || ''
    const venue = venueFor(event)
    const time = schedule.time || ''
    const hasVenue = Boolean(event.venue_name || event.address || event.city) || event.attendance_mode === 'online'
    const missing = [!time && 'time', !hasVenue && 'venue'].filter(Boolean)
    upcoming.push({ event, date: schedule.date, time, endTime, venue, missing })
  }
  const compare = (a, b) => a.date.localeCompare(b.date)
    || (a.time || '99:99').localeCompare(b.time || '99:99')
    || String(a.event.name || '').localeCompare(String(b.event.name || ''))
  upcoming.sort(compare)
  dateNeedsReview.sort((a, b) => String(a.event.name || '').localeCompare(String(b.event.name || '')))
  return { events: upcoming, dateNeedsReview, title: rangeTitle(startDate, endDate) }
}

function formattedDate(value) {
  if (!value) return 'Date not confirmed'
  const [year, month, day] = value.split('-').map(Number)
  return new Intl.DateTimeFormat('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: INDIA_TIME_ZONE,
  }).format(new Date(Date.UTC(year, month - 1, day, 12)))
}

export function weeklyUpdateText(update) {
  const lines = [update.title]
  update.events.forEach(({ event, date, time, endTime, venue }, index) => {
    const timeText = time
      ? `${format12HourTime(time)}${endTime ? ` – ${format12HourTime(endTime)}` : ''}`
      : 'Time not confirmed'
    lines.push(
      '',
      `${index + 1}. ${event.name || 'Event name not confirmed'}`,
      `   Date: ${formattedDate(date)}`,
      `   Time: ${timeText}`,
      `   Venue: ${venue}`,
    )
  })
  if (update.dateNeedsReview.length) {
    lines.push('', 'NEEDS DATE REVIEW')
    update.dateNeedsReview.forEach(({ event, time, endTime, venue }, index) => {
      const timeText = time
        ? `${format12HourTime(time)}${endTime ? ` – ${format12HourTime(endTime)}` : ''}`
        : 'Time not confirmed'
      lines.push(
        '',
        `${update.events.length + index + 1}. ${event.name || 'Event name not confirmed'}`,
        '   Date: Date not confirmed',
        `   Time: ${timeText}`,
        `   Venue: ${venue}`,
      )
    })
  }
  return lines.join('\n')
}

function escapeCsv(value) {
  const text = String(value ?? '')
  return `"${text.replaceAll('"', '""')}"`
}

export function weeklyUpdateCsv(update) {
  const rows = [['Number', 'Event name', 'Date', 'Start time', 'End time', 'Venue', 'Location', 'Needs review']]
  for (const [index, item] of [...update.events, ...update.dateNeedsReview].entries()) {
    const { event, date, time, endTime, venue, missing } = item
    rows.push([
      index + 1,
      event.name || 'Event name not confirmed',
      formattedDate(date),
      time ? format12HourTime(time) : 'Time not confirmed',
      endTime ? format12HourTime(endTime) : '',
      venue,
      event.address || event.city || event.online_details || '',
      (missing || []).join('; '),
    ])
  }
  return rows.map((row) => row.map(escapeCsv).join(',')).join('\r\n')
}
