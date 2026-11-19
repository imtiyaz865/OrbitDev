/**
 * Event type vocabulary, a deterministic keyword classifier and a confidence-scored
 * prediction used during import.
 *
 * `event_type` is free text in the database; these are the values the product uses
 * (older records may hold other text, which is preserved). Keep the vocabulary,
 * rules and classifier in sync with frontend/src/utils/eventType.js (same tests).
 */
export const EVENT_TYPES = ['Meetup', 'Workshop', 'Conference', 'Hackathon', 'Buildathon', 'Webinar', 'Tech Talk', 'Networking', 'Competition', 'Other']

/** Types a classifier or model may choose; "Other" is only ever chosen by an administrator. */
export const PREDICTABLE_EVENT_TYPES = EVENT_TYPES.filter((type) => type !== 'Other')

// Ordered by specificity: the first rule that matches wins.
const RULES = [
  ['Buildathon', /\bbuild[\s-]?a?thon\b/i],
  ['Hackathon', /\bhack(?:athon|[\s-]?days?|[\s-]?nights?|[\s-]?fest)\b|\bhackathon/i],
  ['Competition', /\bcompetitions?\b|\bcontests?\b|\bcapture the flag\b|\bctf\b|\bideathon\b|\bcoding challenge\b|\bpitch (?:battle|competition)\b|\bquiz\b/i],
  ['Webinar', /\bwebinar\b|\bweb[\s-]?cast\b|\blive[\s-]?stream\b/i],
  ['Workshop', /\bworkshops?\b|\bhands[\s-]on\b|\bboot[\s-]?camp\b|\bmaster[\s-]?class\b|\bcode[\s-]?lab\b|\bstudy jam\b/i],
  ['Conference', /\bconference\b|\bsummit\b|\bsymposium\b|\bdevfest\b|\bconclave\b|\b[a-z]{3,}con\b(?!\w)|\b[a-z]+conf\b|\bcon\s?20\d\d\b/i],
  ['Networking', /\bnetworking\b|\bmixer\b|\bmeet\s?(?:&|and)\s?greet\b|\bhappy hour\b|\bstartup social\b|\bfounders?\s(?:social|mixer|circle)\b/i],
  ['Tech Talk', /\btech[\s-]?talks?\b|\bfireside\b|\bpanel discussion\b|\bguest lecture\b|\btalk series\b|\b(?:ama|ask me anything)\b/i],
  ['Meetup', /\bmeet[\s-]?ups?\b|\buser[\s-]?group\b|\bmonthly meet\b|\bcommunity (?:meet|gathering|call)\b|\b(?:weekly|monthly|quarterly) meet\b/i],
]

const SYNONYMS = new Map([
  ['workshop', 'Workshop'], ['training', 'Workshop'], ['bootcamp', 'Workshop'], ['masterclass', 'Workshop'],
  ['meetup', 'Meetup'], ['meet-up', 'Meetup'], ['user group', 'Meetup'], ['social gathering', 'Meetup'],
  ['conference', 'Conference'], ['summit', 'Conference'], ['symposium', 'Conference'],
  ['hackathon', 'Hackathon'], ['buildathon', 'Buildathon'],
  ['webinar', 'Webinar'], ['online event', 'Webinar'],
  ['networking', 'Networking'], ['networking event', 'Networking'], ['mixer', 'Networking'],
  ['tech talk', 'Tech Talk'], ['talk', 'Tech Talk'], ['panel', 'Tech Talk'], ['lecture', 'Tech Talk'],
  ['competition', 'Competition'], ['contest', 'Competition'],
  ['other', 'Other'],
])

/** Maps a free-text or schema.org type onto the vocabulary, or null if it is not recognisable. */
export function normalizeEventType(value) {
  if (typeof value !== 'string' || !value.trim()) return null
  const cleaned = value.trim().replace(/^https?:\/\/schema\.org\//i, '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/\bevent\b/gi, '').trim().toLowerCase()
  const exact = EVENT_TYPES.find((type) => type.toLowerCase() === value.trim().toLowerCase())
  if (exact) return exact
  if (SYNONYMS.has(cleaned)) return SYNONYMS.get(cleaned)
  return classifyText(cleaned)
}

function classifyText(text) {
  if (!text) return null
  for (const [type, pattern] of RULES) if (pattern.test(text)) return type
  return null
}

/** Counts how many distinct places in `text` match each type's rule. */
function typeHits(text) {
  const hits = new Map()
  if (!text) return hits
  for (const [type, pattern] of RULES) {
    const matches = text.match(new RegExp(pattern.source, 'gi'))
    if (matches?.length) hits.set(type, matches.length)
  }
  return hits
}

function eventText({ name, description, agenda_items: agenda, source_title: sourceTitle } = {}) {
  return {
    title: [name, sourceTitle].filter((value) => typeof value === 'string').join(' '),
    body: [
      typeof description === 'string' ? description.slice(0, 4000) : '',
      ...(Array.isArray(agenda) ? agenda.map((item) => `${item?.title || ''} ${item?.description || ''}`) : []),
    ].join(' '),
  }
}

function onlineAdjusted(type, mode) {
  return mode === 'online' && (type === 'Tech Talk' || type === 'Meetup') ? 'Webinar' : type
}

/**
 * Suggests an event type from what the event says about itself. The title is
 * checked first (strongest signal), then the description and agenda. Online-only
 * talks are classified as webinars. Returns null rather than guessing.
 */
export function classifyEventType(fields = {}) {
  const { title, body } = eventText(fields)
  const type = classifyText(title) || classifyText(body)
  return type ? onlineAdjusted(type, fields.attendance_mode) : null
}

const round = (value) => Math.round(value * 100) / 100

/**
 * Decides the event type for an import and how sure that decision is.
 *
 * Signals, strongest first:
 *  - `sourceType`: a type the source page states in its structured metadata;
 *  - the event title naming a type (e.g. "… Hackathon");
 *  - the AI model's classification (`aiType`), which saw the whole page;
 *  - type words in the description and agenda;
 *  - type words anywhere in the public page text (`pageText`).
 *
 * Returns `{ type, confidence, confirmed, method, signals }`, or null when nothing
 * points to a type. Only metadata and an explicit title are `confirmed`; anything
 * else is a prediction the administrator should confirm.
 */
export function predictEventType(fields = {}, { sourceType = null, aiType = null, pageText = '' } = {}) {
  const mode = fields.attendance_mode
  const source = normalizeEventType(sourceType)
  const aiNormalized = normalizeEventType(aiType)
  const ai = PREDICTABLE_EVENT_TYPES.includes(aiNormalized) ? aiNormalized : null
  const { title, body } = eventText(fields)
  const titleType = classifyText(title)
  const bodyHits = typeHits(body)
  const pageHits = typeHits(typeof pageText === 'string' ? pageText.slice(0, 24_000) : '')
  const signals = []

  if (source && source !== 'Other') {
    signals.push('source_metadata')
    return { type: source, confidence: 0.97, confirmed: true, method: 'source_metadata', signals }
  }
  if (titleType) {
    const type = onlineAdjusted(titleType, mode)
    signals.push('title')
    if (ai === type) signals.push('ai')
    // "Tech talk" retitled as a webinar because it is online-only is an inference.
    const confirmed = type === titleType
    return { type, confidence: confirmed ? (ai === type ? 0.95 : 0.9) : 0.8, confirmed, method: 'title_keywords', signals }
  }

  // No explicit signal: score the candidates and keep the best supported one.
  const scores = new Map()
  const add = (type, value, signal) => {
    if (!type) return
    const adjusted = onlineAdjusted(type, mode)
    const entry = scores.get(adjusted) || { score: 0, signals: new Set() }
    entry.score += value
    entry.signals.add(signal)
    scores.set(adjusted, entry)
  }
  if (ai) add(ai, 0.55, 'ai')
  for (const [type, count] of bodyHits) add(type, 0.35 + 0.1 * Math.min(count - 1, 2), 'description')
  for (const [type, count] of pageHits) add(type, 0.15 + 0.05 * Math.min(count - 1, 2), 'page_text')
  if (!scores.size) return null

  const ranked = [...scores.entries()].sort((a, b) => b[1].score - a[1].score)
  const [bestType, best] = ranked[0]
  const runnerUp = ranked[1]?.[1].score || 0
  // Confidence grows with combined evidence and with the lead over the next type.
  const confidence = Math.min(0.88, Math.max(0.3, best.score * 0.85 + (best.score - runnerUp) * 0.25))
  const method = best.signals.has('ai') ? 'ai_prediction' : best.signals.has('description') ? 'description_keywords' : 'page_text_keywords'
  return { type: bestType, confidence: round(confidence), confirmed: false, method, signals: [...best.signals] }
}
