import assert from 'node:assert/strict'
import test from 'node:test'
import { eventSchema, localDateTimeToIso, prepareEventUpdate } from './eventValidation.js'

test('partial event updates preserve omitted fields and update local instants in the supplied timezone', () => {
  const current = {
    id: 'event-id',
    name: 'Original title',
    description: 'Keep this description.',
    start_date: '2026-10-17',
    start_time: '09:00:00',
    start_at: '2026-10-17T03:30:00.000Z',
    timezone: 'Asia/Kolkata',
    status: 'published',
  }
  const result = prepareEventUpdate(current, { start_time: '10:15' })
  assert.equal(result.error, undefined)
  assert.equal(result.updates.description, undefined)
  assert.equal(result.updates.start_time, '10:15')
  assert.equal(result.updates.start_at, '2026-10-17T04:45:00.000Z')
  assert.equal(prepareEventUpdate(current, { status: 'published' }).error, undefined)
})

test('event updates reject invalid IANA zones, inconsistent timestamps, and reversed ranges', () => {
  const current = {
    name: 'Workshop',
    status: 'draft',
    start_date: '2026-10-17',
    start_time: '09:00',
    timezone: 'Asia/Kolkata',
  }
  assert.match(prepareEventUpdate(current, { timezone: 'Mars/Olympus' }).error, /IANA timezone/)
  assert.match(prepareEventUpdate(current, {
    start_at: '2026-10-17T02:30:00.000Z',
  }).error, /does not match/)
  assert.match(prepareEventUpdate(current, { end_date: '2026-10-16' }).error, /end date/)
})

test('local date/time conversion rejects daylight-saving gaps and keeps the event wall time', () => {
  assert.equal(localDateTimeToIso('2026-10-17', '09:30', 'Asia/Kolkata'), '2026-10-17T04:00:00.000Z')
  assert.equal(localDateTimeToIso('2026-10-17', '09:30:00', 'Asia/Kolkata'), '2026-10-17T04:00:00.000Z')
  assert.throws(() => localDateTimeToIso('2026-03-08', '02:30', 'America/New_York'), /does not exist/)
  assert.throws(() => localDateTimeToIso('2026-10-17', '09:30:15', 'Asia/Kolkata'), /nearest minute/)
})

test('event date ranges allow explicit overnight dates and reject a missing rollover date', () => {
  const current = {
    name: 'Overnight event',
    status: 'draft',
    start_date: '2026-10-17',
    start_time: '23:30',
    timezone: 'Asia/Kolkata',
  }
  const overnight = prepareEventUpdate(current, { end_date: '2026-10-18', end_time: '01:00' })
  assert.equal(overnight.error, undefined)
  assert.equal(overnight.updates.end_at, '2026-10-17T19:30:00.000Z')
  assert.match(prepareEventUpdate({ ...current, status: 'published', end_time: '01:00' }, { start_time: '23:30' }).error, /end date/)
  assert.equal(eventSchema.safeParse({ name: 'Bad time', slug: 'bad-time', start_time: '24:00' }).success, false)
})

test('editing a local date clears its stale UTC instant when time is unset', () => {
  const current = {
    name: 'Workshop',
    status: 'draft',
    start_date: '2026-10-17',
    start_time: '09:00',
    start_at: '2026-10-17T03:30:00.000Z',
    timezone: 'Asia/Kolkata',
  }
  const result = prepareEventUpdate(current, { start_time: null })
  assert.equal(result.error, undefined)
  assert.equal(result.updates.start_at, null)
})

test('request validation strips protected database fields and rejects invalid structured input', () => {
  const result = eventSchema.partial().safeParse({
    name: 'Revised title',
    id: 'untrusted-id',
    created_by: 'untrusted-user',
    sponsors: [{ name: 'Valid sponsor', website: 'javascript:alert(1)' }],
  })
  assert.equal(result.success, false)
  const safe = eventSchema.partial().parse({
    name: 'Revised title',
    id: 'untrusted-id',
    created_by: 'untrusted-user',
  })
  assert.deepEqual(safe, { name: 'Revised title' })
})

test('request validation accepts Postgres time values with zero seconds', () => {
  const result = eventSchema.partial().safeParse({
    start_time: '09:30:00',
    end_time: '10:00:00.000000',
  })
  assert.equal(result.success, true)
  assert.deepEqual(result.data, { start_time: '09:30', end_time: '10:00' })
  assert.equal(eventSchema.partial().safeParse({ start_time: '09:30:15' }).success, false)
})
