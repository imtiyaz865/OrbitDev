import assert from 'node:assert/strict'
import test from 'node:test'
import { finalizeImport, imageUrlExpiry, preservesFacts } from './importReview.js'

const now = new Date('2026-11-12T06:00:00Z')
const original = 'Join us for an evening of talks on Postgres 17. Doors open at 6:30 PM. Register at https://example.com/rsvp. Entry fee is Rs 200.'

test('accepts a formatted description only when it changes layout, not facts', () => {
  const layout = 'Join us for an evening of talks on Postgres 17.\n\n- Doors open at 6:30 PM.\n- Register at https://example.com/rsvp.\n- Entry fee is Rs 200.'
  assert.equal(preservesFacts(original, layout), true)
  assert.equal(preservesFacts(original, layout.replace('6:30', '7:00')), false, 'changed time')
  assert.equal(preservesFacts(original, layout.replace('Rs 200', 'Rs 250')), false, 'changed price')
  assert.equal(preservesFacts(original, `${layout}\n- Free pizza for all attendees.`), false, 'added claim')
  assert.equal(preservesFacts(original, layout.replace('\n- Entry fee is Rs 200.', '')), false, 'dropped fact')
  assert.equal(preservesFacts(original, layout.replace('https://example.com/rsvp', 'https://evil.example/rsvp')), false, 'changed URL')
  assert.equal(preservesFacts(original, original), false, 'no change')
  assert.equal(preservesFacts(null, layout), false)
})

test('detects expiring LinkedIn and signed storage image links', () => {
  assert.deepEqual(imageUrlExpiry('https://media.licdn.com/dms/image/x.jpg?e=1794254400&v=beta&t=abc', now), { expiresAt: '2026-11-09T20:00:00.000Z', expired: true })
  assert.equal(imageUrlExpiry('https://media.licdn.com/dms/image/x.jpg?e=1900000000&v=beta', now).expired, false)
  assert.equal(imageUrlExpiry('https://bucket.s3.amazonaws.com/a.png?X-Amz-Signature=abc&X-Amz-Expires=600', now).expired, false)
  assert.equal(imageUrlExpiry('https://images.lumacdn.com/cdn-cgi/image/width=800/event-covers/a.png', now), null)
  assert.equal(imageUrlExpiry('not a url', now), null)
})

function result(fields, extra = {}) {
  return {
    fields: { name: 'n8n Workshop Hyderabad', start_date: '2026-11-21', start_time: '10:00', start_at: '2026-11-21T04:30:00.000Z', timezone: 'Asia/Kolkata', ...fields },
    field_provenance: {},
    missing_fields: [],
    warnings: [],
    extracted_at: '2026-11-12T06:00:00.000Z',
    research: { status: 'completed', model: 'gemini-test' },
    ...extra,
  }
}

test('a complete, consistent import starts verified with a classified type', () => {
  const final = finalizeImport(result({}), null, { now })
  assert.equal(final.fields.verification_status, 'verified')
  assert.equal(final.fields.last_verified_at, '2026-11-12T06:00:00.000Z')
  assert.equal(final.fields.event_type, 'Workshop')
  assert.deepEqual(final.field_provenance.event_type, { method: 'title_keywords', confirmed: true, confidence: 0.9, signals: ['title'] })
})

test('incomplete, inconsistent or past imports are never marked verified', () => {
  for (const [label, input, analysis] of [
    ['missing time', result({ start_time: null, start_at: null }), null],
    ['missing timezone', result({}, { missing_fields: ['timezone'] }), null],
    ['research failed', result({}, { research: { status: 'failed' } }), null],
    ['past event', result({ start_date: '2026-10-01', start_at: '2026-10-01T04:30:00.000Z' }), null],
    ['end before start', result({ end_at: '2026-11-21T03:00:00.000Z' }), null],
    ['AI date flag', result({}), { review_flags: [{ field: 'start_date', kind: 'date_time', message: 'The weekday does not match the date.' }] }],
  ]) {
    const final = finalizeImport(input, analysis, { now })
    assert.equal(final.fields.verification_status, 'needs_review', label)
    assert.equal(final.fields.last_verified_at, null, label)
  }
  const flagged = finalizeImport(result({}), { review_flags: [{ field: 'start_time', kind: 'date_time', message: 'Text says 11 AM; metadata says 10 AM.' }] }, { now })
  assert.ok(flagged.missing_fields.includes('start_time'))
  assert.ok(flagged.warnings.some(({ message }) => message === 'AI review: Text says 11 AM; metadata says 10 AM.'))
})

test('keeps an existing event type, and keeps the original description when formatting changes facts', () => {
  const kept = finalizeImport(result({ event_type: 'Meetup', description: original }), { formatted_description: `${original} Free swag!` }, { now })
  assert.equal(kept.fields.event_type, 'Meetup')
  assert.equal(kept.fields.description, original)
  assert.equal(kept.research.original_description, undefined)

  const formatted = original.replace(' Doors', '\n\n- Doors')
  const applied = finalizeImport(result({ description: original }), { formatted_description: formatted }, { now })
  assert.equal(applied.fields.description, formatted)
  assert.equal(applied.research.original_description, original)
  assert.equal(applied.field_provenance.description.method, 'gemini_format')
})

test('warns about temporary banner links', () => {
  const final = finalizeImport(result({ banner_url: 'https://media.licdn.com/dms/image/x.jpg?e=1794254400&v=beta' }), null, { now })
  assert.ok(final.warnings.some(({ field, message }) => field === 'banner_url' && /expired/.test(message)))
})
