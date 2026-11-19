/**
 * Duplicate event detection for imports, manual creation and publishing.
 *
 * Two independent checks:
 *  1. Same source page: source URLs are normalised per platform (Luma, Meetup,
 *     Eventbrite, others) so tracking parameters, "www.", trailing slashes, regional
 *     domains and lu.ma/luma.com aliases do not hide a match.
 *  2. Same event details: titles that mean the same thing, on the same day (or the
 *     adjacent day, for timezone slips), without a conflicting organizer, start
 *     time or edition number. Recurring events ("Meetup #8" vs "#9") and different
 *     events with similar names on the same day are deliberately not matched.
 *
 * Only active (not soft-deleted) events are considered; drafts and published
 * events are both checked unless `statuses` narrows the search.
 */

const TRACKING_PARAMS = /^(?:utm_.*|fbclid|gclid|mc_[a-z]+|ref|ref_src|referrer|source|src|tk|aff|affiliate|igshid|si|_gl|trk|share|from)$/i
const STOPWORDS = new Set(['the', 'a', 'an', 'and', 'of', 'in', 'at', 'on', 'for', 'with', 'by', 'to', 'x', 'vs', 'edition', 'event', 'events', 'presents', 'present', 'hosted', 'host', 'live', 'india', 'hyderabad', 'hyd'])

const DUPLICATE_COLUMNS = 'id,slug,name,status,start_date,start_time,start_at,organizer_name,source_url,source_platform,updated_at'

/**
 * Canonical identity of an event page URL, or null for a value that is not a URL.
 * Examples: "luma:ai-night", "meetup:301234567", "eventbrite:123456789",
 * "web:example.com/events/ai-night".
 */
export function normalizeSourceUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return null
  let url
  try { url = new URL(value.trim()) } catch { return null }
  if (!['http:', 'https:'].includes(url.protocol)) return null
  const host = url.hostname.toLowerCase().replace(/^(?:www|m|mobile)\./, '')
  const path = decodeURIComponent(url.pathname).replace(/\/+$/, '').toLowerCase()

  if (host === 'lu.ma' || host === 'luma.com' || host.endsWith('.lu.ma')) {
    // lu.ma/<slug> and luma.com/<slug>; event IDs ("evt-…") identify the same page.
    const slug = path.split('/').filter(Boolean).pop()
    if (slug) return `luma:${slug}`
  }
  if (host === 'meetup.com' || host.endsWith('.meetup.com')) {
    const id = path.match(/\/events\/(\d+)/)?.[1]
    if (id) return `meetup:${id}`
  }
  if (/(^|\.)eventbrite\.[a-z.]+$/.test(host)) {
    const id = path.match(/(?:-|\/e\/)(\d{6,})$/)?.[1]
    if (id) return `eventbrite:${id}`
  }
  const params = [...url.searchParams.entries()]
    .filter(([key]) => !TRACKING_PARAMS.test(key))
    .sort(([a], [b]) => a.localeCompare(b))
  const query = params.length ? `?${new URLSearchParams(params)}` : ''
  return `web:${host}${path}${query}`
}

/** A substring every stored URL with this identity must contain; used to narrow the database query. */
export function sourceSearchFragment(key) {
  if (!key) return null
  const [kind, ...rest] = key.split(':')
  const value = rest.join(':')
  const fragment = kind === 'web' ? value.split('?')[0].split('/').filter(Boolean).pop() || value : value
  // Characters with meaning in LIKE patterns or PostgREST filters are dropped; this only widens the search.
  return fragment.replace(/[%_*,()\\"]/g, '').slice(0, 200) || null
}

function words(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .split(/[^a-z0-9+#]+/)
    .filter(Boolean)
}

function titleTokens(title) {
  return words(title).filter((word) => !STOPWORDS.has(word))
}

/** Numbers in a title identify an edition ("#8", "2026", "v2"), so different numbers mean different events. */
function titleNumbers(title) {
  return new Set(String(title || '').match(/\d+/g) || [])
}

/** Dice coefficient over meaningful title words (0..1). */
export function titleSimilarity(left, right) {
  const a = new Set(titleTokens(left))
  const b = new Set(titleTokens(right))
  if (!a.size || !b.size) return 0
  let shared = 0
  for (const word of a) if (b.has(word)) shared += 1
  const dice = (2 * shared) / (a.size + b.size)
  // A title that is another title plus a subtitle ("AI Summit 2026 – Day 1 agenda") is a strong match.
  const smaller = Math.min(a.size, b.size)
  return smaller >= 3 && shared === smaller ? Math.max(dice, 0.85) : dice
}

function sameNumbers(left, right) {
  const a = titleNumbers(left)
  const b = titleNumbers(right)
  if (!a.size || !b.size) return true
  if (a.size !== b.size) return false
  for (const number of a) if (!b.has(number)) return false
  return true
}

function organizerRelation(left, right) {
  const a = words(left).join(' ')
  const b = words(right).join(' ')
  if (!a || !b) return 'unknown'
  if (a === b || a.includes(b) || b.includes(a)) return 'same'
  return titleSimilarity(left, right) >= 0.6 ? 'same' : 'different'
}

function dayDifference(left, right) {
  if (!/^\d{4}-\d{2}-\d{2}/.test(left || '') || !/^\d{4}-\d{2}-\d{2}/.test(right || '')) return null
  return Math.round(Math.abs(Date.parse(`${left.slice(0, 10)}T00:00:00Z`) - Date.parse(`${right.slice(0, 10)}T00:00:00Z`)) / 86_400_000)
}

function minutes(time) {
  const match = String(time || '').match(/^(\d{2}):(\d{2})/)
  return match ? Number(match[1]) * 60 + Number(match[2]) : null
}

function addDays(date, days) {
  const value = new Date(`${date.slice(0, 10)}T00:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

/**
 * Compares a new event with an existing one. Returns null when they are not the
 * same event, or { match, confidence, reasons } when they are.
 */
export function compareEvents(candidate, existing) {
  const candidateKey = normalizeSourceUrl(candidate.source_url)
  if (candidateKey && candidateKey === normalizeSourceUrl(existing.source_url)) {
    return { match: 'source_url', confidence: 'certain', reasons: ['Same source event page'] }
  }

  const days = dayDifference(candidate.start_date, existing.start_date)
  if (days == null || days > 1) return null
  if (!sameNumbers(candidate.name, existing.name)) return null
  const similarity = titleSimilarity(candidate.name, existing.name)
  const organizer = organizerRelation(candidate.organizer_name, existing.organizer_name)
  if (organizer === 'different') return null
  const startA = minutes(candidate.start_time)
  const startB = minutes(existing.start_time)
  // Two sessions on the same day with clearly different start times are different events.
  if (days === 0 && startA != null && startB != null && Math.abs(startA - startB) >= 180) return null

  const reasons = []
  if (days === 0) reasons.push('Same date')
  else reasons.push('Adjacent date')
  if (organizer === 'same') reasons.push('Same organizer')
  reasons.unshift(similarity === 1 ? 'Same title' : `Similar title (${Math.round(similarity * 100)}% match)`)

  const threshold = days === 0
    ? (organizer === 'same' ? 0.7 : 0.8)
    : (organizer === 'same' ? 0.9 : 1.01) // adjacent days need a near-identical title and the same organizer
  if (similarity < threshold) return null
  return { match: 'similar_details', confidence: similarity >= 0.9 && (organizer === 'same' || days === 0) ? 'high' : 'likely', reasons }
}

/**
 * Finds existing events that look like the same event as `candidate`
 * ({ name, start_date, start_time, organizer_name, source_url }).
 * Options: `excludeId` skips the event itself; `statuses` limits the search
 * (default: drafts and published). Results are sorted, strongest match first.
 */
export async function findDuplicateEvents(supabase, candidate, { excludeId = null, statuses = ['draft', 'published'], limit = 5 } = {}) {
  const queries = []
  const base = () => {
    let query = supabase.from('events').select(DUPLICATE_COLUMNS).is('deleted_at', null).in('status', statuses)
    if (excludeId) query = query.neq('id', excludeId)
    return query
  }
  const sourceKey = normalizeSourceUrl(candidate.source_url)
  const fragment = sourceSearchFragment(sourceKey)
  if (fragment) queries.push(base().ilike('source_url', `%${fragment}%`).limit(50))
  if (candidate.name?.trim() && /^\d{4}-\d{2}-\d{2}$/.test(candidate.start_date || '')) {
    queries.push(base().gte('start_date', addDays(candidate.start_date, -1)).lte('start_date', addDays(candidate.start_date, 1)).limit(200))
  }
  if (!queries.length) return []

  const results = await Promise.all(queries)
  const rows = new Map()
  for (const { data, error } of results) {
    if (error) throw error
    for (const row of data || []) rows.set(row.id, row)
  }
  const rank = { certain: 0, high: 1, likely: 2 }
  return [...rows.values()]
    .map((existing) => ({ existing, comparison: compareEvents(candidate, existing) }))
    .filter(({ comparison }) => comparison)
    .sort((a, b) => rank[a.comparison.confidence] - rank[b.comparison.confidence])
    .slice(0, limit)
    .map(({ existing, comparison }) => ({
      id: existing.id,
      slug: existing.slug,
      name: existing.name,
      status: existing.status,
      start_date: existing.start_date,
      start_time: existing.start_time,
      organizer_name: existing.organizer_name,
      source_url: existing.source_url,
      ...comparison,
    }))
}

export function duplicateMessage(duplicates) {
  const first = duplicates[0]
  return `This event already exists in The Orbit: "${first.name}" (${first.status}).`
}
