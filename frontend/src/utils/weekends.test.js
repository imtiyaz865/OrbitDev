import test from 'node:test'
import assert from 'node:assert/strict'
import { formatWeekendRange, getNextWeekend, localDateString, shiftWeekend, zonedDateTimeToIso } from './weekends.js'

test('the selected weekend includes Saturday when the current day is Saturday', () => {
  const weekend = getNextWeekend(new Date(2026, 9, 17, 12))
  assert.equal(localDateString(weekend.start), '2026-10-17')
  assert.equal(localDateString(weekend.end), '2026-10-18')
})

test('the selected weekend includes the remaining Sunday', () => {
  const weekend = getNextWeekend(new Date(2026, 9, 18, 12))
  assert.equal(localDateString(weekend.start), '2026-10-17')
  assert.equal(localDateString(weekend.end), '2026-10-18')
})

test('weekdays select the following Saturday and Sunday', () => {
  const weekend = getNextWeekend(new Date(2026, 9, 16, 12))
  assert.equal(formatWeekendRange(weekend), '17–18 October')
})

test('weekend navigation preserves Saturday/Sunday boundaries', () => {
  const first = getNextWeekend(new Date(2026, 9, 16, 12))
  const following = shiftWeekend(first, 1)
  assert.equal(localDateString(following.start), '2026-10-24')
  assert.equal(localDateString(following.end), '2026-10-25')
})

test('time conversion uses the event timezone instead of the browser timezone', () => {
  assert.equal(
    zonedDateTimeToIso('2026-10-17', '09:00', 'Asia/Kolkata'),
    '2026-10-17T03:30:00.000Z',
  )
})

test('time conversion rejects nonexistent local times during daylight-saving transitions', () => {
  assert.throws(() => zonedDateTimeToIso('2026-03-08', '02:30', 'America/New_York'), /does not exist/)
})
