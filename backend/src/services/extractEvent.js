import { load } from 'cheerio'
import { researchedEventFields, researchEventDetails } from './geminiResearch.js'
import { safeFetchPage } from './safeFetch.js'

const text = (value) => typeof value === 'string' && value.trim() ? value.trim() : null
const defaultGeminiModel = 'gemini-3.8-flash'
const eventTimezone = 'Asia/Kolkata'

function safeGeminiError(error) {
  let apiError = {}
  try {
    apiError = JSON.parse(error?.message).error || {}
  } catch {
    apiError = {}
  }

  const apiKey = process.env.GEMINI_API_KEY
  const redact = (value) => {
    let safeValue = String(value ?? '')
    if (apiKey) safeValue = safeValue.replaceAll(apiKey, '[REDACTED]')
    return safeValue
      .replace(/\bAIza[0-9A-Za-z_-]{20,}\b/g, '[REDACTED]')
      .replace(/(api[_-]?key|authorization|bearer)\s*[:=]\s*[^\s,;]+/ig, '$1=[REDACTED]')
      .slice(0, 2000)
  }

  return {
    name: redact(error?.name || 'Error'),
    status: error?.status || apiError.code || null,
    code: apiError.status || error?.code || null,
    message: redact(apiError.message || error?.message || String(error) || 'Unknown Gemini error'),
    details: apiError.details ? redact(JSON.stringify(apiError.details)) : undefined,
  }
}

function publicUrl(value, baseUrl) {
  if (!value) return null
  try {
    const url = new URL(value, baseUrl)
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : null
  } catch {
    return null
  }
}

function scalar(value) {
  if (typeof value === 'string') return text(value)
  if (value && typeof value === 'object') return text(value.name) || text(value['@id']) || null
  return null
}

function findEventJsonLd($) {
  const candidates = []
  $('script[type="application/ld+json"]').each((_index, element) => {
    try {
      const value = JSON.parse($(element).text())
      const entries = Array.isArray(value) ? value : value['@graph'] || [value]
      for (const entry of entries) {
        if (entry && typeof entry === 'object') {
          const types = Array.isArray(entry['@type']) ? entry['@type'] : [entry['@type']]
          if (types.some((type) => /event$/i.test(type || ''))) candidates.push(entry)
        }
      }
    } catch {
      // Invalid JSON-LD is ignored; other public metadata may still be usable.
    }
  })
  return candidates[0] || null
}

function getMeta($, names) {
  for (const name of names) {
    const value = $(`meta[property="${name}"], meta[name="${name}"]`).first().attr('content')
    if (text(value)) return text(value)
  }
  return null
}

function itempropDate($, name) {
  const element = $(`[itemprop="${name}"]`).first()
  return text(element.attr('datetime')) || text(element.attr('content')) || text(element.text())
}

function validDate(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

function instantParts(value, timezone = eventTimezone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(value)).map(({ type, value: partValue }) => [type, partValue]))
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  }
}

function toEventTimezone(date, time, sourceTimezone) {
  const instant = validLocalDateTime(date, time, sourceTimezone || eventTimezone)
  return instant ? { ...instantParts(instant), startAt: instant } : null
}

function parseEventDate(value, sourceTimezone) {
  if (typeof value !== 'string') return { date: null, time: null, startAt: null }
  const normalized = value.trim()
  const iso = normalized.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(Z|[+-]\d{2}:?\d{2})?)?$/i)
  if (iso) {
    const [, yearText, monthText, dayText, hourText, minuteText, secondText, , offset] = iso
    const year = Number(yearText)
    const month = Number(monthText)
    const day = Number(dayText)
    const hour = hourText == null ? null : Number(hourText)
    const minute = minuteText == null ? null : Number(minuteText)
    const second = secondText == null ? 0 : Number(secondText)
    if (!validDate(year, month, day) || (hour != null && (hour > 23 || minute > 59 || second > 59))) {
      return { date: null, time: null, startAt: null }
    }
    if (offset && offset.toUpperCase() !== 'Z') {
      const offsetParts = offset.slice(1).replace(':', '')
      if (Number(offsetParts.slice(0, 2)) > 23 || Number(offsetParts.slice(2)) > 59) {
        return { date: null, time: null, startAt: null }
      }
    }
    const sourceDate = `${yearText}-${monthText}-${dayText}`
    const sourceTime = hourText == null ? null : `${hourText}:${minuteText}`
    const timestamp = hourText != null && offset
      ? Date.parse(normalized.replace(' ', 'T'))
      : Number.NaN
    if (!Number.isNaN(timestamp)) {
      const local = instantParts(timestamp)
      return { ...local, startAt: new Date(timestamp).toISOString() }
    }
    if (sourceTime) {
      return toEventTimezone(sourceDate, sourceTime, sourceTimezone)
        || { date: sourceDate, time: null, startAt: null }
    }
    return {
      date: sourceDate,
      time: sourceTime,
      startAt: null,
    }
  }

  const human = normalized.match(/^(?:(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2}),?\s+(\d{4})|(\d{1,2})\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{4}))(?:,?\s+(\d{1,2}):(\d{2})\s*(AM|PM)?)?$/i)
  if (!human) return { date: null, time: null, startAt: null }
  const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
  const monthName = human[1] || human[5]
  const year = Number(human[3] || human[7])
  const month = months.indexOf(monthName.slice(0, 3).toLowerCase()) + 1
  const day = Number(human[2] || human[4])
  if (!validDate(year, month, day)) return { date: null, time: null, startAt: null }
  let hour = human[7] == null ? null : Number(human[7])
  const minute = human[8] == null ? null : Number(human[8])
  if (human[9]) hour = hour % 12 + (human[9].toUpperCase() === 'PM' ? 12 : 0)
  if (hour != null && (hour > 23 || minute > 59)) return { date: null, time: null, startAt: null }
  const sourceDate = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  const sourceTime = hour == null ? null : `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
  if (sourceTime) {
    return toEventTimezone(sourceDate, sourceTime, sourceTimezone)
      || { date: sourceDate, time: null, startAt: null }
  }
  return { date: sourceDate, time: null, startAt: null }
}

function normalizeDate(value) {
  return parseEventDate(value).startAt
}

function localDateParts(value, sourceTimezone) {
  const { date, time } = parseEventDate(value, sourceTimezone)
  return { date, time }
}

function validTimezone(value) {
  const timezone = text(value)
  if (!timezone) return null
  try {
    new Intl.DateTimeFormat('en', { timeZone: timezone })
    return timezone
  } catch {
    return null
  }
}

function platformFromUrl(value) {
  const host = new URL(value).hostname.replace(/^www\./, '').toLowerCase()
  if (host === 'lu.ma' || host.endsWith('.lu.ma')) return 'Luma'
  if (host === 'meetup.com' || host.endsWith('.meetup.com')) return 'Meetup'
  if (host === 'eventbrite.com' || host.endsWith('.eventbrite.com')) return 'Eventbrite'
  return host
}

export function parseEventHtml(html, sourceUrl, finalUrl = sourceUrl) {
  const $ = load(html)
  const jsonLd = findEventJsonLd($)
  const title = text(jsonLd?.name) || getMeta($, ['og:title', 'twitter:title']) || text($('h1').first().text()) || text($('title').text())
  const description = text(jsonLd?.description) || getMeta($, ['og:description', 'description', 'twitter:description'])
  const imageValue = jsonLd?.image
  const image = Array.isArray(imageValue)
    ? scalar(imageValue[0]) || imageValue[0]?.url
    : typeof imageValue === 'object' ? scalar(imageValue) || imageValue?.url : imageValue
  const location = jsonLd?.location
  const eventLocation = Array.isArray(location) ? location[0] : location
  const address = typeof eventLocation?.address === 'string'
    ? eventLocation.address
    : eventLocation?.address && typeof eventLocation.address === 'object'
      ? [eventLocation.address.streetAddress, eventLocation.address.addressLocality, eventLocation.address.addressRegion, eventLocation.address.postalCode, eventLocation.address.addressCountry].filter(Boolean).join(', ')
      : null
  const rawOrganizer = jsonLd?.organizer
  const organizer = Array.isArray(rawOrganizer) ? rawOrganizer[0] : rawOrganizer
  const offers = Array.isArray(jsonLd?.offers) ? jsonLd.offers : jsonLd?.offers ? [jsonLd.offers] : []
  const offer = offers[0]
  const registrationUrl = offer?.url
  const price = offer?.price != null && String(offer.price).trim() ? Number(offer.price) : Number.NaN
  const organizerLogo = typeof organizer?.logo === 'string' ? organizer.logo : organizer?.logo?.url || organizer?.logo?.contentUrl
  const startValue = text(jsonLd?.startDate) || itempropDate($, 'startDate') || getMeta($, ['event:start_time', 'og:start_time', 'event:start_date', 'startDate'])
  const endValue = text(jsonLd?.endDate) || itempropDate($, 'endDate') || getMeta($, ['event:end_time', 'og:end_time', 'event:end_date', 'endDate'])
  const eventSchedule = Array.isArray(jsonLd?.eventSchedule) ? jsonLd.eventSchedule[0] : jsonLd?.eventSchedule
  const sourceTimezone = validTimezone(
    eventSchedule?.scheduleTimezone
      || jsonLd?.timeZone
      || itempropDate($, 'timeZone')
      || getMeta($, ['event:timezone', 'event:timeZone', 'timezone', 'timeZone', 'event_timezone']),
  )
  const start = parseEventDate(startValue, sourceTimezone)
  const end = parseEventDate(endValue, sourceTimezone)
  const timezone = eventTimezone
  const banner = text(image) || getMeta($, ['og:image', 'twitter:image'])
  const performers = Array.isArray(jsonLd?.performer) ? jsonLd.performer : jsonLd?.performer ? [jsonLd.performer] : []
  const subEvents = Array.isArray(jsonLd?.subEvent) ? jsonLd.subEvent : jsonLd?.subEvent ? [jsonLd.subEvent] : []
  const rawSponsors = Array.isArray(jsonLd?.sponsor) ? jsonLd.sponsor : jsonLd?.sponsor ? [jsonLd.sponsor] : []
  const speakers = performers.map((speaker) => ({
    name: scalar(speaker),
    role: text(speaker.jobTitle),
    organization: scalar(speaker.worksFor),
    biography: text(speaker.description),
    image_url: typeof speaker.image === 'string' ? speaker.image : speaker.image?.url || null,
  })).filter((speaker) => speaker.name)
  const agendaItems = subEvents.map((item) => ({
    title: text(item.name),
    description: text(item.description),
    start_time: localDateParts(item.startDate, sourceTimezone).time,
    end_time: localDateParts(item.endDate, sourceTimezone).time,
    speaker_name: scalar(item.performer),
  })).filter((item) => item.title)
  const sponsors = rawSponsors.map((sponsor) => ({
    name: scalar(sponsor),
    website: typeof sponsor?.url === 'string' ? sponsor.url : null,
    logo_url: typeof sponsor?.logo === 'string' ? sponsor.logo : sponsor?.logo?.url || null,
  })).filter((sponsor) => sponsor.name)
  const missingFields = [
    !title && 'name',
    !start.date && 'start_date',
    !start.time && 'start_time',
    !end.date && 'end_date',
    !end.time && 'end_time',
    (!sourceTimezone || sourceTimezone !== eventTimezone) && 'timezone',
    !description && 'description',
    !registrationUrl && 'registration_url',
    !banner && 'banner_url',
  ].filter(Boolean)
  const fields = {
    name: title,
    description,
    start_at: start.startAt,
    end_at: end.startAt,
    start_date: start.date,
    start_time: start.time,
    end_date: end.date,
    end_time: end.time,
    timezone,
    event_type: scalar(jsonLd?.eventType) || scalar(jsonLd?.category),
    attendance_mode: /online/i.test(jsonLd?.eventAttendanceMode || '')
      ? 'online'
      : /mixed/i.test(jsonLd?.eventAttendanceMode || '')
        ? 'mixed'
        : /offline/i.test(jsonLd?.eventAttendanceMode || '') ? 'offline' : null,
    venue_name: scalar(eventLocation),
    address: text(address),
    city: text(eventLocation?.address?.addressLocality),
    organizer_name: scalar(organizer),
    organizer_website: typeof organizer?.url === 'string' ? organizer.url : null,
    organizer_logo_url: organizerLogo,
    speakers,
    agenda_items: agendaItems,
    sponsors,
    registration_url: text(registrationUrl),
    registration_fee_type: Number.isFinite(price) ? price === 0 ? 'free' : 'paid' : null,
    registration_amount: Number.isFinite(price) ? price : null,
    registration_currency: text(offer?.priceCurrency),
    registration_deadline: normalizeDate(offer?.validThrough || offer?.availabilityEnds),
    registration_status: text(offer?.availability)?.split('/').pop() || null,
    banner_url: banner,
    original_banner_url: banner,
    source_url: sourceUrl,
    source_platform: platformFromUrl(sourceUrl),
    source_title: text($('title').text()) || getMeta($, ['og:title']),
  }
  for (const key of ['banner_url', 'original_banner_url', 'organizer_website', 'organizer_logo_url', 'registration_url']) {
    fields[key] = publicUrl(fields[key], finalUrl)
  }
  for (const speaker of speakers) {
    speaker.image_url = publicUrl(speaker.image_url, finalUrl)
  }
  for (const sponsor of sponsors) {
    sponsor.website = publicUrl(sponsor.website, finalUrl)
    sponsor.logo_url = publicUrl(sponsor.logo_url, finalUrl)
  }
  const warnings = []
  if (!start.date) warnings.push({ field: 'start_date', message: startValue ? 'The start date on the page could not be parsed; enter it manually.' : 'No event start date was found on the page.' })
  if (!start.time) warnings.push({
    field: 'start_time',
    message: start.date && startValue && sourceTimezone
      ? 'The source start time could not be converted unambiguously from its timezone. Confirm it on the source page and enter the Hyderabad-local time.'
      : start.date ? 'No event start time was found; enter it manually if known.' : 'The start time could not be determined without a start date.',
  })
  if (!end.date) warnings.push({ field: 'end_date', message: endValue ? 'The event end date on the page could not be parsed; enter it manually.' : 'No event end date was found on the page.' })
  if (!end.time) warnings.push({ field: 'end_time', message: end.date ? 'No event end time was found; enter it manually if known.' : 'No event end time was found on the page.' })
  if (!sourceTimezone) warnings.push({ field: 'timezone', message: 'No source timezone was found. The event is set to Asia/Kolkata by default; confirm its date and time against the source before publishing.' })
  else if (sourceTimezone !== eventTimezone) warnings.push({ field: 'timezone', message: `The source time in ${sourceTimezone} was converted to Asia/Kolkata. Confirm the converted event date and time.` })
  return {
    fields,
    field_provenance: {
      timezone: sourceTimezone
        ? { method: 'source_metadata', source_url: finalUrl }
        : { method: 'default', timezone: eventTimezone },
    },
    missing_fields: missingFields,
    warnings,
    extracted_field_count: Object.values(fields).filter((value) => value !== null && value !== '' && (!Array.isArray(value) || value.length > 0)).length,
    extracted_at: new Date().toISOString(),
  }
}

function validLocalDateTime(date, time, timezone) {
  if (!date || !time || !timezone) return null
  try {
    const [year, month, day] = date.split('-').map(Number)
    const [hour, minute] = time.split(':').map(Number)
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
    let converged = false
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const parts = Object.fromEntries(formatter.formatToParts(new Date(guess)).map(({ type, value }) => [type, value]))
      const represented = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute))
      const adjustment = target - represented
      if (adjustment === 0) {
        converged = true
        break
      }
      guess += adjustment
    }
    if (!converged) return null
    const matches = new Set()
    const searchStep = 15 * 60 * 1000
    for (let offset = -4 * 60 * 60 * 1000; offset <= 4 * 60 * 60 * 1000; offset += searchStep) {
      const candidate = guess + offset
      const parts = Object.fromEntries(formatter.formatToParts(new Date(candidate)).map(({ type, value }) => [type, value]))
      const represented = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute))
      if (represented === target) matches.add(candidate)
      if (matches.size > 1) return null
    }
    if (matches.size === 1) return new Date([...matches][0]).toISOString()
  } catch {
    return null
  }
  return null
}

function mergeResearchResult(extraction, research, sourceUrl, finalUrl) {
  const fields = { ...extraction.fields }
  const provenance = {}
  const warnings = [...extraction.warnings]
  const missing = new Set(extraction.missing_fields)
  const requiredFields = new Set(['start_date', 'start_time', 'timezone'])

  for (const field of researchedEventFields) {
    const value = research.fields[field]
    if (value == null || value === '' || (Array.isArray(value) && value.length === 0)) continue
    if (['organizer_website', 'registration_url', 'banner_url'].includes(field)) {
      const safe = publicUrl(value, finalUrl)
      if (!safe) continue
      research.fields[field] = safe
    }
    if (field === 'speakers' || field === 'sponsors') {
      const urlKeys = field === 'speakers' ? ['image_url'] : ['website', 'logo_url']
      research.fields[field] = value.map((item) => {
        const normalized = { ...item }
        for (const key of urlKeys) {
          if (normalized[key]) normalized[key] = publicUrl(normalized[key], finalUrl)
        }
        return normalized
      })
    }
    if (field === 'registration_deadline') {
      const parsed = parseEventDate(value)
      const normalized = parsed.startAt || validLocalDateTime(parsed.date, parsed.time, fields.timezone)
      if (!normalized) continue
      research.fields[field] = normalized
    }
    if (field === 'timezone') {
      const timezone = validTimezone(value)
      if (!timezone) continue
      research.fields[field] = timezone
    }
    if (fields[field] != null && fields[field] !== '' && JSON.stringify(fields[field]) !== JSON.stringify(value)) {
      warnings.push({
        field,
        message: `Structured page metadata and researched information disagree for ${field.replaceAll('_', ' ')}. The original page value was kept; confirm it before publishing.`,
      })
      if (requiredFields.has(field)) missing.add(field)
      continue
    }
    if (fields[field] == null || fields[field] === '' || (Array.isArray(fields[field]) && fields[field].length === 0)) {
      fields[field] = value
      provenance[field] = research.field_provenance[field]
      missing.delete(field)
    }
  }

  if (fields.start_date && fields.start_time && fields.timezone) {
    const startAt = validLocalDateTime(fields.start_date, fields.start_time, fields.timezone)
    if (startAt) fields.start_at = startAt
    else {
      missing.add('start_time')
      warnings.push({ field: 'start_time', message: 'The researched local start time could not be normalized safely in its timezone.' })
    }
  }
  if (fields.end_date && fields.end_time && fields.timezone) {
    const endAt = validLocalDateTime(fields.end_date, fields.end_time, fields.timezone)
    if (endAt) fields.end_at = endAt
    else warnings.push({ field: 'end_time', message: 'The researched local end time could not be normalized safely in its timezone.' })
  }

  const sourceUrls = new Set([sourceUrl, finalUrl, ...research.source_urls])
  return {
    ...extraction,
    fields,
    missing_fields: [...missing],
    warnings,
    field_provenance: { ...extraction.field_provenance, ...provenance },
    research: {
      status: research.status,
      model: research.model || null,
      search_grounding_enabled: research.search_grounding_enabled || false,
      search_grounding_used: research.search_grounding_used || false,
      source_urls: [...sourceUrls],
    },
    extracted_field_count: Object.values(fields).filter((value) => value !== null && value !== '' && (!Array.isArray(value) || value.length > 0)).length,
  }
}

export async function extractEventFromUrl(sourceUrl, { research = researchEventDetails, fetchPage = safeFetchPage } = {}) {
  const { html, finalUrl } = await fetchPage(sourceUrl)
  const extraction = parseEventHtml(html, sourceUrl, finalUrl)
  try {
    const enhanced = await research({ html, sourceUrl, finalUrl, existingFields: extraction.fields })
    return mergeResearchResult(extraction, enhanced, sourceUrl, finalUrl)
  } catch (error) {
    console.warn('Gemini event research unavailable; continuing with page metadata only.', safeGeminiError(error))
    return {
      ...extraction,
      research: { status: 'unavailable', model: process.env.GEMINI_MODEL?.trim() || defaultGeminiModel, source_urls: [sourceUrl, finalUrl] },
      warnings: [...extraction.warnings, { field: 'research', message: 'AI research is unavailable. This import uses only public page metadata.' }],
    }
  }
}
