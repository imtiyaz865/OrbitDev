import assert from 'node:assert/strict'
import test from 'node:test'
import { EVENT_TYPES, classifyEventType, normalizeEventType, predictEventType } from './eventType.js'

// Shared with frontend/src/utils/eventType.test.js — keep the two tables identical.
const classificationCases = [
  ['n8n Workshop Hyderabad', 'Workshop'],
  ['React Hyderabad Meetup #8', 'Meetup'],
  ['Hyderabad PostgreSQL UserGroup Meetup', 'Meetup'],
  ['Northstar Conference | Hyderabad', 'Conference'],
  ['GopherCon India 2026', 'Conference'],
  ['RubyConf India 2026', 'Conference'],
  ['DevFest Hyderabad 2026', 'Conference'],
  ['Paytm Build for India AI Hackathon', 'Hackathon'],
  ['Hacktoberfest Hack Day Hyderabad', 'Hackathon'],
  ['Replit Buildathon Hyderabad', 'Buildathon'],
  ['Scaling Postgres — a webinar', 'Webinar'],
  ['Founders Networking Night', 'Networking'],
  ['Fireside chat with a CTO', 'Tech Talk'],
  ['Null Hyd Monthly Meet October 2026', 'Meetup'],
  ['Building in the AI Era: Meet AIRO', null],
  ['Ideas Over Idli', null],
  ['IDC Walk', null],
  ['Hyderabad CTF Championship 2026', 'Competition'],
  ['Inter-college Coding Contest', 'Competition'],
]

test('classifies event titles onto the vocabulary and never guesses', () => {
  for (const [name, expected] of classificationCases) {
    assert.equal(classifyEventType({ name }), expected, name)
  }
})

test('falls back to the description and agenda, and treats online talks as webinars', () => {
  assert.equal(classifyEventType({ name: 'Kubernetes Day', description: 'A hands-on workshop for platform teams.' }), 'Workshop')
  assert.equal(classifyEventType({ name: 'Agents in practice', agenda_items: [{ title: 'Panel discussion' }] }), 'Tech Talk')
  assert.equal(classifyEventType({ name: 'Tech talk: Rust in production', attendance_mode: 'online' }), 'Webinar')
  assert.equal(classifyEventType({}), null)
})

test('normalises free-text and schema.org types', () => {
  assert.equal(normalizeEventType('hackathon'), 'Hackathon')
  assert.equal(normalizeEventType('Tech Talk'), 'Tech Talk')
  assert.equal(normalizeEventType('Social gathering'), 'Meetup')
  assert.equal(normalizeEventType('EducationEvent'), null)
  assert.equal(normalizeEventType('Event'), null)
  assert.equal(normalizeEventType(''), null)
  assert.equal(normalizeEventType('contest'), 'Competition')
  assert.equal(normalizeEventType('other'), 'Other')
  assert.deepEqual(EVENT_TYPES, ['Meetup', 'Workshop', 'Conference', 'Hackathon', 'Buildathon', 'Webinar', 'Tech Talk', 'Networking', 'Competition', 'Other'])
  assert.ok(EVENT_TYPES.every((type) => normalizeEventType(type) === type))
})

test('import prediction: metadata and an explicit title are confirmed', () => {
  assert.deepEqual(predictEventType({ name: 'Untitled' }, { sourceType: 'Hackathon' }), { type: 'Hackathon', confidence: 0.97, confirmed: true, method: 'source_metadata', signals: ['source_metadata'] })
  const titled = predictEventType({ name: 'Paytm AI Hackathon' }, { aiType: 'Hackathon' })
  assert.equal(titled.type, 'Hackathon')
  assert.equal(titled.confirmed, true)
  assert.equal(titled.confidence, 0.95)
  // A title type wins over a disagreeing model.
  assert.equal(predictEventType({ name: 'Rust Workshop' }, { aiType: 'Conference' }).type, 'Workshop')
  // An online "tech talk" is a webinar, but that is an inference.
  const online = predictEventType({ name: 'Tech talk: Rust in production', attendance_mode: 'online' })
  assert.equal(online.type, 'Webinar')
  assert.equal(online.confirmed, false)
})

test('import prediction: uncertain types are predictions with a confidence', () => {
  const described = predictEventType({ name: 'Kubernetes Day', description: 'A hands-on workshop for platform teams. Bring a laptop for the workshop labs.' })
  assert.equal(described.type, 'Workshop')
  assert.equal(described.confirmed, false)
  assert.equal(described.method, 'description_keywords')
  assert.ok(described.confidence > 0.4 && described.confidence < 0.88)

  const agreed = predictEventType({ name: 'Kubernetes Day', description: 'A hands-on workshop.' }, { aiType: 'Workshop' })
  assert.equal(agreed.method, 'ai_prediction')
  assert.ok(agreed.confidence > described.confidence, 'agreeing signals raise confidence')

  const aiOnly = predictEventType({ name: 'Ideas Over Idli' }, { aiType: 'Networking' })
  assert.equal(aiOnly.type, 'Networking')
  assert.equal(aiOnly.confirmed, false)

  const pageOnly = predictEventType({ name: 'Ideas Over Idli' }, { pageText: 'Join founders for a morning of networking over breakfast.' })
  assert.equal(pageOnly.type, 'Networking')
  assert.equal(pageOnly.method, 'page_text_keywords')
  assert.ok(pageOnly.confidence < aiOnly.confidence, 'page text alone is the weakest signal')

  assert.equal(predictEventType({ name: 'IDC Walk' }), null, 'no evidence, no prediction')
  assert.equal(predictEventType({ name: 'IDC Walk' }, { aiType: 'Other' }), null, 'the model never picks Other')
})
