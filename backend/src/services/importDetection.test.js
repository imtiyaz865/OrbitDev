import assert from 'node:assert/strict'
import test from 'node:test'
import { extractEventFromUrl } from './extractEvent.js'

const sourceUrl = 'https://lu.ma/test-event'
const offline = async () => { throw new Error('Gemini is not configured in tests.') }

function pageWith({ name, description = '', availability = null, body = '' }) {
  const offers = availability ? `,"offers":{"@type":"Offer","url":"${sourceUrl}","availability":"https://schema.org/${availability}","price":0}` : ''
  return `<html><head><script type="application/ld+json">{"@type":"Event","name":"${name}","description":"${description}","startDate":"2099-02-07T10:00:00+05:30"${offers}}</script></head><body><main>${body}</main></body></html>`
}

async function importPage(html, research = offline) {
  return extractEventFromUrl(sourceUrl, { fetchPage: async () => ({ html, finalUrl: sourceUrl }), research })
}

test('imports detect each registration status from the page and never send internal signals', async () => {
  const cases = [
    ['open from a button', pageWith({ name: 'A', body: '<button>Register</button>' }), 'open', 'page_label'],
    ['open from metadata', pageWith({ name: 'A', availability: 'InStock' }), 'open', 'source_metadata'],
    ['waitlist beats InStock metadata', pageWith({ name: 'A', availability: 'InStock', body: '<p>Event Full</p><button>Join Waitlist</button>' }), 'waitlist', 'page_label'],
    ['sold out', pageWith({ name: 'A', availability: 'SoldOut' }), 'sold_out', 'source_metadata'],
    ['closed', pageWith({ name: 'A', body: '<div>Registration closed</div>' }), 'closed', 'page_label'],
    ['unknown', pageWith({ name: 'A' }), 'not_announced', 'not_found'],
  ]
  for (const [label, html, status, method] of cases) {
    const result = await importPage(html)
    assert.equal(result.fields.registration_status, status, label)
    assert.equal(result.field_provenance.registration_status.method, method, label)
    assert.equal(result.signals, undefined, label)
  }
  const unknown = await importPage(pageWith({ name: 'A' }))
  assert.ok(unknown.warnings.some(({ field }) => field === 'registration_status'))
})

test('imports store a confirmed type for explicit titles and a scored prediction otherwise', async () => {
  const titled = await importPage(pageWith({ name: 'GenAI Buildathon Hyderabad' }))
  assert.equal(titled.fields.event_type, 'Buildathon')
  assert.equal(titled.field_provenance.event_type.confirmed, true)

  const described = await importPage(pageWith({ name: 'Kubernetes Day', description: 'A hands-on workshop for platform teams.' }))
  assert.equal(described.fields.event_type, 'Workshop')
  assert.equal(described.field_provenance.event_type.confirmed, false)
  assert.equal(typeof described.field_provenance.event_type.confidence, 'number')

  // The model's classification is used as a prediction when the page has no type words.
  const research = async () => ({
    status: 'completed', model: 'test-model', fields: { event_type: 'Networking', registration_status: 'open' },
    field_provenance: {}, source_urls: [], analysis: { formatted_description: null, review_flags: [] },
  })
  const predicted = await importPage(pageWith({ name: 'Ideas Over Idli' }), research)
  assert.equal(predicted.fields.event_type, 'Networking')
  const provenance = predicted.field_provenance.event_type
  assert.deepEqual({ method: provenance.method, confirmed: provenance.confirmed, model: provenance.model }, { method: 'ai_prediction', confirmed: false, model: 'test-model' })
  assert.equal(predicted.fields.registration_status, 'open')
  assert.equal(predicted.field_provenance.registration_status.method, 'ai_page_reading')

  const unknown = await importPage(pageWith({ name: 'IDC Walk' }))
  assert.equal(unknown.fields.event_type, null, 'no evidence, no type')
})
