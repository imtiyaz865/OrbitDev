import { addDays, format, nextSaturday, startOfDay } from 'date-fns'

export function getNextWeekend(referenceDate = new Date()) {
  const today = startOfDay(referenceDate)
  const day = today.getDay()
  const saturday = day === 6 ? today : day === 0 ? addDays(today, -1) : nextSaturday(today)
  const sunday = addDays(saturday, 1)
  return { start: saturday, end: sunday }
}

export function shiftWeekend(weekend, amount) {
  return {
    start: addDays(weekend.start, amount * 7),
    end: addDays(weekend.end, amount * 7),
  }
}

export function localDateString(date) {
  return format(date, 'yyyy-MM-dd')
}

export function formatWeekendRange(weekend) {
  const startMonth = format(weekend.start, 'MMMM')
  const endMonth = format(weekend.end, 'MMMM')
  return startMonth === endMonth
    ? `${format(weekend.start, 'd')}–${format(weekend.end, 'd MMMM')}`
    : `${format(weekend.start, 'd MMM')}–${format(weekend.end, 'd MMM')}`
}

export function formatEventDate(dateString, timeZone) {
  void timeZone
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString || '')) return ''
  return new Intl.DateTimeFormat('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'Asia/Kolkata',
  }).format(new Date(`${dateString}T12:00:00.000Z`))
}

export function isWeekendStartDate(dateString) {
  const date = new Date(`${dateString}T12:00:00`)
  return date.getDay() === 0 || date.getDay() === 6
}

export function zonedDateTimeToIso(dateString, timeString, timeZone) {
  if (!dateString || !timeString || !timeZone) return null
  const [year, month, day] = dateString.split('-').map(Number)
  const [hour, minute] = timeString.split(':').map(Number)
  const target = Date.UTC(year, month - 1, day, hour, minute)
  const formatter = new Intl.DateTimeFormat('en', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
  let guess = target
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(guess)).map((part) => [part.type, part.value]))
    const represented = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute))
    const adjustment = target - represented
    if (adjustment === 0) return new Date(guess).toISOString()
    guess += adjustment
  }
  throw new Error(`That local time does not exist in ${timeZone}.`)
}

export function isoToZonedInput(value, timeZone) {
  if (!value) return ''
  if (!/(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) return value.slice(0, 16)
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  try {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en', {
      timeZone: timeZone || 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date).map((part) => [part.type, part.value]))
    return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`
  } catch {
    return value.slice(0, 16)
  }
}
