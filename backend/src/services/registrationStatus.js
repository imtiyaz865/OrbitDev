/**
 * Registration availability: whether people can still sign up for an event.
 *
 * Stored in `events.registration_status` as one of REGISTRATION_STATUSES. This is
 * separate from publishing (`status`) and data checking (`verification_status`):
 * a published event can have closed registrations. Older records may hold
 * schema.org values (e.g. "InStock") or free text; normalizeRegistrationStatus
 * maps the recognisable ones. Keep in sync with frontend/src/utils/registrationStatus.js.
 */
export const REGISTRATION_STATUSES = ['open', 'closed', 'waitlist', 'sold_out', 'not_announced']

const SCHEMA_ORG_AVAILABILITY = new Map([
  ['instock', 'open'],
  ['limitedavailability', 'open'],
  ['onlineonly', 'open'],
  ['instoreonly', 'open'],
  ['presale', 'open'],
  ['soldout', 'sold_out'],
  ['outofstock', 'sold_out'],
  ['discontinued', 'closed'],
])

const TEXT_ALIASES = [
  ['not_announced', /^(?:not[\s_-]?announced|unknown|tbc|tba|to be (?:announced|confirmed)|status not (?:announced|confirmed)|registration status not confirmed)$/i],
  ['waitlist', /^(?:wait[\s_-]?list(?:ed)?(?: only| open)?|join (?:the )?wait[\s-]?list)$/i],
  ['sold_out', /^(?:sold[\s_-]?out|fully[\s_-]?booked|full|at capacity)$/i],
  ['closed', /^(?:closed|registrations? closed|ended|expired|unavailable|cancelled|canceled)$/i],
  ['open', /^(?:open|registrations? open|available|registration available)$/i],
]

/**
 * Maps a stored, scraped or model-supplied value onto REGISTRATION_STATUSES.
 * Returns null when the value is empty or not recognisable (never guesses).
 */
export function normalizeRegistrationStatus(value) {
  if (typeof value !== 'string' || !value.trim()) return null
  const trimmed = value.trim()
  if (REGISTRATION_STATUSES.includes(trimmed)) return trimmed
  const key = trimmed.replace(/^https?:\/\/schema\.org\//i, '').replace(/[\s_-]+/g, '').toLowerCase()
  if (SCHEMA_ORG_AVAILABILITY.has(key)) return SCHEMA_ORG_AVAILABILITY.get(key)
  for (const [status, pattern] of TEXT_ALIASES) if (pattern.test(trimmed)) return status
  return null
}

// Page labels, most specific first. Each is matched against short visible texts
// (buttons, links, badges), never against long description paragraphs.
const PAGE_PATTERNS = [
  ['closed', /\bregistrations? (?:is |are |has |have )?(?:now )?closed\b|\bno longer accepting (?:registrations|rsvps|responses|applications)\b|\b(?:ticket )?sales (?:have )?ended\b|\bthis event has (?:ended|passed)\b|\bevent (?:has )?ended\b|\bapplications? (?:are |is )?closed\b/i],
  ['waitlist', /\bjoin (?:the )?wait[\s-]?list\b|\bwait[\s-]?list (?:is )?open\b|\brequest to join (?:the )?wait[\s-]?list\b|\bget on (?:the )?wait[\s-]?list\b|\badd(?:ed)? to (?:the )?wait[\s-]?list\b/i],
  ['sold_out', /\bsold out\b|\bfully booked\b|\bevent (?:is )?full\b|\bat capacity\b|\bno (?:more )?(?:tickets|seats|spots) (?:left|available|remaining)\b/i],
  ['open', /^(?:register(?: now| here| for (?:free|this event))?|rsvp(?: now)?|get (?:your )?tickets?|buy tickets?|book (?:now|tickets?|your (?:spot|seat))|reserve (?:a |your )?(?:spot|seat)|request to join|one-click rsvp|apply now|registrations? (?:are |is )?open)$/i],
]
const MAX_LABEL_LENGTH = 80

function collapse(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

/**
 * Reads registration labels from the public page (a cheerio root). Looks at
 * buttons, links and short text elements only; navigation and footers are ignored.
 * Returns { status, evidence } or null when the page shows nothing conclusive.
 */
export function registrationStatusFromPage($) {
  if (!$) return null
  const found = new Map()
  $('button, a, [role="button"], input[type="submit"], span, strong, p, div, h2, h3, h4, label, li').each((_index, element) => {
    const node = $(element)
    if (node.closest('nav, footer, header, script, style, noscript').length) return
    const label = collapse(node.is('input') ? node.attr('value') : node.text())
    if (!label || label.length > MAX_LABEL_LENGTH) return
    for (const [status, pattern] of PAGE_PATTERNS) {
      // "Open" wording only counts on an actual call-to-action element.
      if (status === 'open' && !node.is('button, a, [role="button"], input')) continue
      if (pattern.test(label) && !found.has(status)) found.set(status, label)
    }
  })
  for (const status of ['closed', 'waitlist', 'sold_out', 'open']) {
    if (found.has(status)) return { status, evidence: found.get(status) }
  }
  return null
}

/**
 * Combines the available evidence into a final registration status for an import.
 * Visible page labels win over structured metadata (pages update the button long
 * before they update their JSON-LD); a deadline that has passed means closed.
 * When nothing is conclusive the result is "not_announced" — never a guess.
 */
export function resolveRegistrationStatus({ page = null, metadata = null, ai = null, deadline = null, now = new Date() } = {}) {
  const fromDeadline = deadline && Number.isFinite(Date.parse(deadline)) && Date.parse(deadline) < now.getTime()
  if (fromDeadline && page?.status !== 'sold_out') {
    return { status: 'closed', method: 'registration_deadline', evidence: deadline }
  }
  if (page?.status) return { status: page.status, method: 'page_label', evidence: page.evidence }
  const fromMetadata = normalizeRegistrationStatus(metadata)
  if (fromMetadata && fromMetadata !== 'not_announced') return { status: fromMetadata, method: 'source_metadata', evidence: metadata }
  const fromAi = normalizeRegistrationStatus(ai)
  if (fromAi && fromAi !== 'not_announced') return { status: fromAi, method: 'ai_page_reading', evidence: ai }
  return { status: 'not_announced', method: 'not_found', evidence: null }
}
