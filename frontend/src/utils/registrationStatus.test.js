import assert from 'node:assert/strict'
import test from 'node:test'
import {
  REGISTRATION_STATUS_OPTIONS,
  normalizeRegistrationStatus,
  registrationStatusInfo,
  registrationStatusOptions,
  registrationStatusOrigin,
  registrationStatusSelectValue,
} from './registrationStatus.js'

test('public labels for every registration status, with unknown values never shown as open', () => {
  assert.deepEqual(registrationStatusInfo('open'), { key: 'open', label: 'Registrations Open', available: true })
  assert.deepEqual(registrationStatusInfo('closed'), { key: 'closed', label: 'Registrations Closed', available: false })
  assert.deepEqual(registrationStatusInfo('waitlist'), { key: 'waitlist', label: 'Join Waitlist', available: true })
  assert.deepEqual(registrationStatusInfo('sold_out'), { key: 'sold_out', label: 'Fully Booked', available: false })
  assert.deepEqual(registrationStatusInfo('not_announced'), { key: 'not_announced', label: 'Status Not Announced', available: false })
  for (const unknown of [null, undefined, '', 'Limited seats', 'PreOrder']) {
    assert.equal(registrationStatusInfo(unknown).label, 'Status Not Announced', String(unknown))
  }
  // Older records stored schema.org availability.
  assert.equal(registrationStatusInfo('InStock').label, 'Registrations Open')
  assert.equal(registrationStatusInfo('https://schema.org/SoldOut').label, 'Fully Booked')
})

test('normalisation matches the backend vocabulary', () => {
  assert.deepEqual(REGISTRATION_STATUS_OPTIONS.map(({ value }) => value), ['open', 'closed', 'waitlist', 'sold_out', 'not_announced'])
  assert.equal(normalizeRegistrationStatus('Registrations Closed'), 'closed')
  assert.equal(normalizeRegistrationStatus('Join Waitlist'), 'waitlist')
  assert.equal(normalizeRegistrationStatus('fully booked'), 'sold_out')
  assert.equal(normalizeRegistrationStatus('Discontinued'), 'closed')
})

test('admin dropdown shows a mapped value and keeps unmapped legacy text selectable', () => {
  assert.equal(registrationStatusSelectValue('InStock'), 'open')
  assert.equal(registrationStatusSelectValue(''), 'not_announced')
  assert.equal(registrationStatusSelectValue(null), 'not_announced')
  assert.equal(registrationStatusSelectValue('Limited seats'), 'Limited seats')
  assert.equal(registrationStatusOptions('open').length, 5)
  const legacy = registrationStatusOptions('Limited seats')
  assert.equal(legacy.length, 6)
  assert.equal(legacy[5].value, 'Limited seats')
})

test('the editor explains how an imported status was decided', () => {
  assert.equal(registrationStatusOrigin({ method: 'page_label', evidence: 'Join Waitlist' }).label, 'Detected from the event page (“Join Waitlist”)')
  assert.equal(registrationStatusOrigin({ method: 'not_found' }).label, 'Not shown on the source page')
  assert.equal(registrationStatusOrigin('manually_edited'), null)
})
