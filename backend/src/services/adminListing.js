/**
 * Helpers for the admin event list endpoints.
 *
 * LIST_COLUMNS covers every field read by the admin list views: the event
 * library, Recently Deleted, the Overview "Recent events" list and the weekly
 * update (venue, attendance and registration status). Heavy detail fields such
 * as description, speakers, agenda and extraction metadata are only returned
 * by GET /api/admin/events/:id.
 */
export const LIST_COLUMNS = [
  'id', 'slug', 'name', 'event_type', 'status',
  'start_at', 'end_at', 'start_date', 'start_time', 'end_date', 'end_time', 'timezone',
  'attendance_mode', 'venue_name', 'address', 'city', 'online_details',
  'organizer_name', 'registration_status', 'banner_url',
  'source_platform', 'source_url', 'verification_status',
  'created_at', 'updated_at', 'deleted_at',
].join(',')

export const RECOVERY_PERIOD_MS = 30 * 24 * 60 * 60 * 1000

export const EVENT_STATUSES = ['draft', 'published', 'archived']
export const SORT_OPTIONS = ['updated', 'date', 'name']
export const SORT_DIRECTIONS = ['asc', 'desc']

const MAX_SEARCH_LENGTH = 200

/**
 * Validates list query parameters. Unknown status, sort or direction values are
 * rejected with a message rather than silently ignored. Paging stays lenient
 * (clamped) to match the previous behaviour.
 */
export function listParams(query = {}) {
  const value = (key) => (typeof query[key] === 'string' ? query[key].trim() : '')
  const status = value('status')
  const sort = value('sort') || 'updated'
  const direction = value('direction') || 'desc'
  if (status && !EVENT_STATUSES.includes(status)) return { error: `Status must be one of: ${EVENT_STATUSES.join(', ')}.` }
  if (!SORT_OPTIONS.includes(sort)) return { error: `Sort must be one of: ${SORT_OPTIONS.join(', ')}.` }
  if (!SORT_DIRECTIONS.includes(direction)) return { error: 'Direction must be asc or desc.' }
  const search = value('search').replace(/[%_\\]/g, '').slice(0, MAX_SEARCH_LENGTH)
  const date = value('date')
  if (date && !isCalendarDate(date)) return { error: 'Date must be a valid YYYY-MM-DD calendar date.' }
  return {
    date,
    page: Math.max(1, Math.floor(Number(query.page)) || 1),
    pageSize: Math.min(100, Math.max(1, Math.floor(Number(query.page_size)) || 20)),
    status,
    search,
    sort,
    direction,
  }
}

function isCalendarDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

/**
 * PostgREST `or` filter for events on one Asia/Kolkata calendar day: events with a
 * start instant are matched by that instant within the IST day (correct even for
 * records stored in another timezone); events without one by their stored date.
 */
export function indiaDayFilter(date) {
  const start = new Date(`${date}T00:00:00+05:30`)
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000)
  return `and(start_at.gte.${start.toISOString()},start_at.lt.${end.toISOString()}),and(start_at.is.null,start_date.eq.${date})`
}

/** Today's date (YYYY-MM-DD) in Asia/Kolkata, matching how event dates are stored. */
export function indiaToday(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

/**
 * Splits an inclusive row range [from, to] over two ordered groups, where the
 * first group holds `firstCount` rows. Returns the inclusive range to request
 * from each group, or null when a group contributes nothing to this page.
 */
export function splitRange(from, to, firstCount) {
  const upcoming = from < firstCount ? [from, Math.min(to, firstCount - 1)] : null
  const pastFrom = Math.max(from, firstCount) - firstCount
  const pastTo = to - firstCount
  const past = pastTo >= 0 && pastTo >= pastFrom ? [pastFrom, pastTo] : null
  return { upcoming, past }
}

