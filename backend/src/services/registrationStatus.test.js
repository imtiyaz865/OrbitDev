import assert from 'node:assert/strict'
import test from 'node:test'
import { load } from 'cheerio'
import { normalizeRegistrationStatus, registrationStatusFromPage, resolveRegistrationStatus } from './registrationStatus.js'

test('stored, schema.org and free-text values normalise onto the supported statuses', () => {
  assert.equal(normalizeRegistrationStatus('InStock'), 'open')
  assert.equal(normalizeRegistrationStatus('https://schema.org/SoldOut'), 'sold_out')
  assert.equal(normalizeRegistrationStatus('LimitedAvailability'), 'open')
  assert.equal(normalizeRegistrationStatus('Discontinued'), 'closed')
  assert.equal(normalizeRegistrationStatus('Registrations Closed'), 'closed')
  assert.equal(normalizeRegistrationStatus('Join Waitlist'), 'waitlist')
  assert.equal(normalizeRegistrationStatus('fully booked'), 'sold_out')
  assert.equal(normalizeRegistrationStatus('not_announced'), 'not_announced')
  assert.equal(normalizeRegistrationStatus('waitlist'), 'waitlist')
  // Unknown or ambiguous values are never guessed.
  assert.equal(normalizeRegistrationStatus('PreOrder'), null)
  assert.equal(normalizeRegistrationStatus('Limited seats, register soon!'), null)
  assert.equal(normalizeRegistrationStatus(''), null)
  assert.equal(normalizeRegistrationStatus(null), null)
})

const page = (body) => load(`<html><body><header><a href="/signup">Sign up</a><a>Register</a></header>${body}<footer><a>Registration closed for older events</a></footer></body></html>`)

test('page labels show open, closed, waitlist and sold out registrations', () => {
  assert.deepEqual(registrationStatusFromPage(page('<main><button>Register</button></main>')), { status: 'open', evidence: 'Register' })
  assert.deepEqual(registrationStatusFromPage(page('<main><a href="#">RSVP now</a></main>')), { status: 'open', evidence: 'RSVP now' })
  assert.equal(registrationStatusFromPage(page('<main><div class="badge">Registration Closed</div></main>')).status, 'closed')
  assert.equal(registrationStatusFromPage(page('<main><p>This event has ended</p></main>')).status, 'closed')
  assert.equal(registrationStatusFromPage(page('<main><span>Event Full</span><button>Join Waitlist</button></main>')).status, 'waitlist')
  assert.equal(registrationStatusFromPage(page('<main><button disabled>Sold Out</button></main>')).status, 'sold_out')
})

test('pages without a clear registration label stay unknown', () => {
  // Header/footer links and "register" inside long description text are ignored.
  assert.equal(registrationStatusFromPage(page('<main><p>Please register on the partner site before the deadline so we can plan food and seating for everyone attending.</p></main>')), null)
  assert.equal(registrationStatusFromPage(page('<main><span>Register</span></main>')), null, 'plain text is not a call to action')
  assert.equal(registrationStatusFromPage(null), null)
})

test('resolution prefers visible page labels, honours a passed deadline and otherwise says not announced', () => {
  const now = new Date('2026-11-18T00:00:00Z')
  assert.equal(resolveRegistrationStatus({ page: { status: 'waitlist', evidence: 'Join Waitlist' }, metadata: 'InStock', now }).status, 'waitlist')
  assert.deepEqual(resolveRegistrationStatus({ metadata: 'https://schema.org/InStock', now }), { status: 'open', method: 'source_metadata', evidence: 'https://schema.org/InStock' })
  assert.equal(resolveRegistrationStatus({ metadata: 'InStock', deadline: '2026-11-10T00:00:00Z', now }).status, 'closed')
  assert.equal(resolveRegistrationStatus({ ai: 'sold_out', now }).method, 'ai_page_reading')
  assert.deepEqual(resolveRegistrationStatus({ metadata: 'PreOrder', now }), { status: 'not_announced', method: 'not_found', evidence: null })
  assert.equal(resolveRegistrationStatus({ now }).status, 'not_announced')
})
