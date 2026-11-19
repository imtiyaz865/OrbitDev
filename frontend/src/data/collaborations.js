/**
 * The Orbit's community collaborations.
 *
 * Every record comes from a publicly discoverable LinkedIn announcement.
 * Keep the association type accurate: only use `official-partner` where the
 * organiser named The Orbit an *official* community partner. Do not add
 * collaborations that have not been publicly announced.
 *
 * Fields
 * - id               Stable slug, also the expected banner file name.
 * - title            Event name as announced.
 * - partnerLabel     How the partners relate to the event ("Organised by", "With", ...).
 * - partners         Primary organisers / collaborators.
 * - supportingPartners  Additional partners named in the announcement (optional).
 * - association      One of the keys in `associationTypes`.
 * - associationLabel Optional override when the announcement used a combined wording.
 * - startDate/endDate ISO dates (YYYY-MM-DD). `null` when no public date is confirmed.
 * - description      One or two factual sentences. No claims beyond the announcement.
 * - banner           Original event banner from the announcement, stored in
 *                    /public/images/collaborations/. Missing files fall back to a
 *                    branded panel automatically, so never substitute a stock image.
 * - announcementUrl  Link to the original LinkedIn announcement. `null` until the
 *                    exact post URL is added; the card then links to The Orbit's
 *                    LinkedIn posts instead.
 * - featured         Shown as the large editorial card (use for one record).
 */

export const associationTypes = {
  'official-partner': 'Official Community Partner',
  'community-partner': 'Community Partner',
  collaboration: 'Collaboration',
  'community-support': 'Community Support',
}

/** Fallback destination while a specific announcement URL is not yet recorded. */
export const COLLABORATIONS_FALLBACK_URL = 'https://www.linkedin.com/company/theorbitcommunity/posts/'

const BANNER_DIR = '/images/collaborations'

export const collaborations = [
  {
    id: 'devfest-hyderabad-2026',
    title: 'DevFest Hyderabad 2026',
    partnerLabel: 'Organised by',
    partners: ['Google Developers Group Hyderabad'],
    association: 'official-partner',
    startDate: '2026-10-24',
    endDate: null,
    description: 'GDG Hyderabad’s annual developer festival. The Orbit took part as an official community partner.',
    banner: `${BANNER_DIR}/devfest-hyderabad-2026.webp`,
    announcementUrl: null,
    featured: true,
  },
  {
    id: 'aws-student-community-days-2026',
    title: 'AWS Student Community Days Hyderabad 2026',
    partnerLabel: 'Hosted by',
    partners: ['AWS Student Builder Group – MECS'],
    association: 'community-partner',
    startDate: '2026-10-09',
    endDate: null,
    description: 'AWS Student Community Days in Hyderabad, hosted by the AWS Student Builder Group at MECS and supported by The Orbit as a community partner.',
    banner: `${BANNER_DIR}/aws-student-community-days-2026.webp`,
    announcementUrl: null,
  },
  {
    id: 'tech-horizon-2',
    title: 'TECH HORIZON 2.0',
    partnerLabel: 'Hosted by',
    partners: ['IEEE SMC GNI'],
    association: 'community-partner',
    startDate: '2026-10-09',
    endDate: '2026-10-10',
    description: 'A two-day technology event by IEEE SMC GNI, with The Orbit as a community partner.',
    banner: `${BANNER_DIR}/tech-horizon-2.webp`,
    announcementUrl: null,
  },
  {
    id: 'ai-product-builder-workshop',
    title: 'AI Product Builder Workshop',
    partnerLabel: 'With',
    partners: ['React Hyderabad', 'Global AI Hyderabad', 'Rezoomex'],
    association: 'community-partner',
    startDate: '2026-10-31',
    endDate: null,
    description: 'A workshop for people building AI products, run together with three Hyderabad communities.',
    banner: `${BANNER_DIR}/ai-product-builder-workshop.webp`,
    announcementUrl: null,
  },
  {
    id: 'agentic-hour',
    title: 'Agentic Hour – React Hyderabad Meetup #8',
    partnerLabel: 'With',
    partners: ['React Hyderabad', 'Project Humans in the Loop'],
    supportingPartners: ['Bolna', 'Juicer Technology', 'GoAvo.ai'],
    association: 'collaboration',
    associationLabel: 'Collaboration · Community Partner',
    startDate: '2026-08-09',
    endDate: null,
    description: 'The eighth React Hyderabad meetup, centred on agentic AI.',
    banner: `${BANNER_DIR}/agentic-hour.webp`,
    announcementUrl: null,
  },
  {
    id: 'elastic-user-group-workshop',
    title: 'Elastic User Group Hyderabad Workshop',
    partnerLabel: 'With',
    partners: ['React Hyderabad', 'Elastic User Group Hyderabad'],
    association: 'collaboration',
    associationLabel: 'Community Collaboration',
    startDate: '2026-08-22',
    endDate: null,
    description: 'A community workshop run jointly by React Hyderabad and Elastic User Group Hyderabad.',
    banner: `${BANNER_DIR}/elastic-user-group-workshop.webp`,
    announcementUrl: null,
  },
  {
    id: 'hyderabad-pgdays-2026',
    title: 'Hyderabad PGDays 2026',
    partnerLabel: 'With',
    partners: ['React Hyderabad', 'PGDays organising team'],
    association: 'community-support',
    associationLabel: 'Community Support · Booth',
    startDate: null,
    endDate: null,
    description: 'Hyderabad’s PostgreSQL community conference, where The Orbit supported a community booth with React Hyderabad.',
    banner: `${BANNER_DIR}/hyderabad-pgdays-2026.webp`,
    announcementUrl: null,
  },
]

/** Featured first, then most recent first; undated records last. */
export function sortCollaborations(items) {
  return [...items].sort((a, b) => {
    if (a.featured !== b.featured) return a.featured ? -1 : 1
    if (!a.startDate || !b.startDate) return a.startDate ? -1 : b.startDate ? 1 : 0
    return b.startDate.localeCompare(a.startDate)
  })
}

const dayMonthYear = { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }

function toDate(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

/** "24 Oct 2026", "9–10 Oct 2026", or null when no date is confirmed. */
export function formatCollaborationDate({ startDate, endDate }) {
  if (!startDate) return null
  const start = toDate(startDate)
  if (!endDate || endDate === startDate) return start.toLocaleDateString('en-GB', dayMonthYear)
  const end = toDate(endDate)
  const sameMonth = start.getUTCFullYear() === end.getUTCFullYear() && start.getUTCMonth() === end.getUTCMonth()
  if (sameMonth) return `${start.getUTCDate()}–${end.toLocaleDateString('en-GB', dayMonthYear)}`
  return `${start.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })} – ${end.toLocaleDateString('en-GB', dayMonthYear)}`
}

export function associationLabel(item) {
  return item.associationLabel || associationTypes[item.association] || 'Collaboration'
}
