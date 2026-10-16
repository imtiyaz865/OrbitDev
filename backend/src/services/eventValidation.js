import { z } from 'zod'

function minutePrecisionTime(value) {
  if (typeof value !== 'string') return null
  return value.match(/^((?:[01]\d|2[0-3]):[0-5]\d)(?::00(?:\.0{1,6})?)?$/)?.[1] || null
}

const dateValue = z.preprocess((value) => value === '' ? null : value, z.string().date().nullable()).optional()
const timeValue = z.preprocess((value) => {
  if (value === '') return null
  return minutePrecisionTime(value) || value
}, z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/).nullable()).optional()
const textValue = z.preprocess((value) => value === '' ? null : value, z.string().nullable()).optional()
const nullableDateTime = z.preprocess((value) => value === '' ? null : value, z.string().datetime({ offset: true }).nullable()).optional()

function isWebUrl(value) {
  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password
  } catch {
    return false
  }
}

const optionalPublicUrl = z.preprocess(
  (value) => value === '' ? null : value,
  z.string().url().refine(isWebUrl, 'Use a public HTTP or HTTPS URL.').nullable(),
).optional()

const entrySchema = z.object({
  name: z.string().max(240).optional(),
  title: z.string().max(500).optional(),
  role: z.string().max(240).optional(),
  organization: z.string().max(500).optional(),
  biography: z.string().max(8000).optional(),
  description: z.string().max(8000).optional(),
  start_time: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/).nullable().optional(),
  end_time: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/).nullable().optional(),
  speaker_name: z.string().max(240).optional(),
  website: optionalPublicUrl,
  logo_url: optionalPublicUrl,
  image_url: optionalPublicUrl,
}).passthrough()

export const eventSchema = z.object({
  name: z.string().trim().min(1).max(240),
  slug: z.string().trim().min(1).max(240).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  description: textValue,
  event_type: textValue,
  tags: z.array(z.string().max(100)).max(100).optional(),
  start_at: nullableDateTime,
  end_at: nullableDateTime,
  start_date: dateValue,
  start_time: timeValue,
  end_date: dateValue,
  end_time: timeValue,
  timezone: z.string().max(120).nullable().optional(),
  attendance_mode: textValue,
  venue_name: textValue,
  address: textValue,
  city: textValue,
  online_details: textValue,
  organizer_name: textValue,
  organizer_website: optionalPublicUrl,
  organizer_logo_url: optionalPublicUrl,
  sponsors: z.array(entrySchema).max(100).optional(),
  speakers: z.array(entrySchema).max(100).optional(),
  agenda_items: z.array(entrySchema).max(150).optional(),
  registration_url: optionalPublicUrl,
  registration_fee_type: textValue,
  registration_amount: z.preprocess(
    (value) => value === '' || value == null ? null : Number(value),
    z.number().finite().nonnegative().nullable(),
  ).optional(),
  registration_currency: textValue,
  registration_deadline: nullableDateTime,
  registration_status: textValue,
  banner_url: optionalPublicUrl,
  original_banner_url: optionalPublicUrl,
  source_url: optionalPublicUrl,
  source_platform: textValue,
  source_title: textValue,
  extraction_status: textValue,
  extraction_metadata: z.record(z.string(), z.unknown()).optional(),
  field_provenance: z.record(z.string(), z.unknown()).optional(),
  missing_fields: z.array(z.string().max(100)).max(100).optional(),
  verification_status: textValue,
  extracted_at: nullableDateTime,
  last_verified_at: nullableDateTime,
  status: z.enum(['draft', 'published', 'archived']).optional(),
})

function validTimezone(timezone) {
  if (!timezone) return false
  try {
    new Intl.DateTimeFormat('en', { timeZone: timezone })
    return true
  } catch {
    return false
  }
}

export function localDateTimeToIso(date, time, timezone) {
  if (!date || !time || !timezone) return null
  const normalizedTime = minutePrecisionTime(time)
  if (!normalizedTime) throw new Error('Enter an event time to the nearest minute.')
  const [year, month, day] = date.split('-').map(Number)
  const [hour, minute] = normalizedTime.split(':').map(Number)
  const target = Date.UTC(year, month - 1, day, hour, minute)
  const formatter = new Intl.DateTimeFormat('en', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
  let guess = target
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(guess)).map(({ type, value }) => [type, value]))
    const represented = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute))
    const adjustment = target - represented
    if (adjustment === 0) return new Date(guess).toISOString()
    guess += adjustment
  }
  throw new Error(`The local event time does not exist in ${timezone}.`)
}

function instantMatchesLocal(value, date, time, timezone) {
  if (!value || !date || !time || !timezone) return true
  const normalizedTime = minutePrecisionTime(time)
  if (!normalizedTime) return false
  const formatter = new Intl.DateTimeFormat('en', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
  const parts = Object.fromEntries(formatter.formatToParts(new Date(value)).map(({ type, value: partValue }) => [type, partValue]))
  return `${parts.year}-${parts.month}-${parts.day}` === date
    && `${parts.hour}:${parts.minute}` === normalizedTime
}

export function prepareEventUpdate(current, updates) {
  const merged = { ...current, ...updates }
  const persisted = { ...updates }
  if (merged.timezone && !validTimezone(merged.timezone)) {
    return { error: 'Enter a valid IANA timezone.' }
  }

  try {
    if (!Object.hasOwn(updates, 'start_at') && (Object.hasOwn(updates, 'start_date') || Object.hasOwn(updates, 'start_time') || Object.hasOwn(updates, 'timezone'))) {
      const startAt = localDateTimeToIso(merged.start_date, merged.start_time, merged.timezone)
      persisted.start_at = merged.start_at = startAt
    }
    if (!Object.hasOwn(updates, 'end_at') && (Object.hasOwn(updates, 'end_date') || Object.hasOwn(updates, 'end_time') || Object.hasOwn(updates, 'timezone'))) {
      const endAt = localDateTimeToIso(merged.end_date, merged.end_time, merged.timezone)
      persisted.end_at = merged.end_at = endAt
    }
  } catch (error) {
    return { error: error.message }
  }

  if (merged.status === 'published' && (!merged.name?.trim() || !merged.start_date || !merged.timezone)) {
    return { error: 'A name, start date, and timezone are required for a published event.' }
  }
  try {
    if (!instantMatchesLocal(merged.start_at, merged.start_date, merged.start_time, merged.timezone)
      || !instantMatchesLocal(merged.end_at, merged.end_date, merged.end_time, merged.timezone)) {
      return { error: 'The saved timestamp does not match the event local date, time, and timezone.' }
    }
  } catch {
    return { error: 'A local event date or time is invalid for its timezone.' }
  }
  if (merged.end_date && merged.start_date && merged.end_date < merged.start_date) {
    return { error: 'The event end date cannot be before its start date.' }
  }
  if (merged.status === 'published' && !merged.end_date && merged.start_time && merged.end_time && merged.end_time <= merged.start_time) {
    return { error: 'Enter the end date for an event that ends at or after midnight.' }
  }
  if (merged.end_date === merged.start_date && merged.start_time && merged.end_time && merged.end_time <= merged.start_time) {
    return { error: 'The event end time must be after its start time.' }
  }
  if (merged.start_at && merged.end_at && Date.parse(merged.end_at) < Date.parse(merged.start_at)) {
    return { error: 'The event end time cannot be before its start time.' }
  }
  return { updates: persisted }
}
