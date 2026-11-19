/**
 * Registration availability, separate from publishing status. Stored values are
 * open | closed | waitlist | sold_out | not_announced; older records may hold
 * schema.org values ("InStock") or free text. Keep the normaliser in sync with
 * backend/src/services/registrationStatus.js.
 */
export const REGISTRATION_STATUS_OPTIONS = [
  { value: 'open', label: 'Open', publicLabel: 'Registrations Open' },
  { value: 'closed', label: 'Closed', publicLabel: 'Registrations Closed' },
  { value: 'waitlist', label: 'Waitlist', publicLabel: 'Join Waitlist' },
  { value: 'sold_out', label: 'Sold Out', publicLabel: 'Fully Booked' },
  { value: 'not_announced', label: 'Not Announced', publicLabel: 'Status Not Announced' },
]
const VALUES = REGISTRATION_STATUS_OPTIONS.map(({ value }) => value)

const SCHEMA_ORG_AVAILABILITY = new Map([
  ['instock', 'open'], ['limitedavailability', 'open'], ['onlineonly', 'open'], ['instoreonly', 'open'], ['presale', 'open'],
  ['soldout', 'sold_out'], ['outofstock', 'sold_out'], ['discontinued', 'closed'],
])

const TEXT_ALIASES = [
  ['not_announced', /^(?:not[\s_-]?announced|unknown|tbc|tba|to be (?:announced|confirmed)|status not (?:announced|confirmed)|registration status not confirmed)$/i],
  ['waitlist', /^(?:wait[\s_-]?list(?:ed)?(?: only| open)?|join (?:the )?wait[\s-]?list)$/i],
  ['sold_out', /^(?:sold[\s_-]?out|fully[\s_-]?booked|full|at capacity)$/i],
  ['closed', /^(?:closed|registrations? closed|ended|expired|unavailable|cancelled|canceled)$/i],
  ['open', /^(?:open|registrations? open|available|registration available)$/i],
]

/** Maps any stored value onto a supported status, or null when it is not recognisable. */
export function normalizeRegistrationStatus(value) {
  if (typeof value !== 'string' || !value.trim()) return null
  const trimmed = value.trim()
  if (VALUES.includes(trimmed)) return trimmed
  const key = trimmed.replace(/^https?:\/\/schema\.org\//i, '').replace(/[\s_-]+/g, '').toLowerCase()
  if (SCHEMA_ORG_AVAILABILITY.has(key)) return SCHEMA_ORG_AVAILABILITY.get(key)
  for (const [status, pattern] of TEXT_ALIASES) if (pattern.test(trimmed)) return status
  return null
}

/**
 * What the public site shows. Unknown, empty and unrecognised values all read
 * "Status Not Announced" — the site never claims registrations are open without data.
 * `available` says whether the register button should be presented as an action.
 */
export function registrationStatusInfo(value) {
  const key = normalizeRegistrationStatus(value) || 'not_announced'
  const option = REGISTRATION_STATUS_OPTIONS.find((item) => item.value === key)
  return { key, label: option.publicLabel, available: key === 'open' || key === 'waitlist' }
}

/**
 * Options for the admin dropdown. A legacy free-text value that cannot be mapped is
 * kept as an extra option so saving the form does not silently change it.
 */
export function registrationStatusOptions(current) {
  const raw = typeof current === 'string' ? current.trim() : ''
  if (!raw || normalizeRegistrationStatus(raw)) return REGISTRATION_STATUS_OPTIONS
  return [...REGISTRATION_STATUS_OPTIONS, { value: raw, label: `${raw} (old value)`, publicLabel: 'Status Not Announced' }]
}

/** The value the admin dropdown should show for a stored value. */
export function registrationStatusSelectValue(current) {
  const raw = typeof current === 'string' ? current.trim() : ''
  if (!raw) return 'not_announced'
  return normalizeRegistrationStatus(raw) || raw
}

/** How the stored status was decided, from `field_provenance.registration_status`. */
export function registrationStatusOrigin(provenance) {
  if (!provenance || typeof provenance !== 'object') return null
  const labels = {
    page_label: 'Detected from the event page',
    source_metadata: 'Detected from page metadata',
    registration_deadline: 'Registration deadline has passed',
    ai_page_reading: 'AI read from the event page',
    not_found: 'Not shown on the source page',
  }
  const label = labels[provenance.method]
  if (!label) return null
  return { label: provenance.evidence && provenance.method === 'page_label' ? `${label} (“${provenance.evidence}”)` : label }
}
