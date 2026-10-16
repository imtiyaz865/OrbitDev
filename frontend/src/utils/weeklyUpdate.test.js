import assert from 'node:assert/strict'
import test from 'node:test'
import { createWeeklyUpdate, defaultIndiaWeekend, indiaDateString, shiftDateString, weeklyUpdateCsv, weeklyUpdateText } from './weeklyUpdate.js'

test('weekend defaults are computed using India local date across a UTC date boundary', () => {
  const fridayEveningInIndia = new Date('2026-10-16T18:00:00.000Z')
  assert.equal(indiaDateString(fridayEveningInIndia), '2026-10-16')
  assert.deepEqual(defaultIndiaWeekend(fridayEveningInIndia), { start: '2026-10-17', end: '2026-10-18' })
  assert.equal(shiftDateString('2026-12-31', 1), '2027-01-01')
})

test('weekly update filters unpublished and cancelled events, sorts IST dates/times, and flags missing details', () => {
  const update = createWeeklyUpdate([
    { id: 'late', name: 'Later event', status: 'published', start_at: '2026-10-25T12:30:00Z', end_at: null, timezone: 'America/New_York', attendance_mode: 'online' },
    { id: 'early', name: 'Earlier event', status: 'published', start_date: '2026-10-24', start_time: '09:30:00', timezone: 'Asia/Kolkata', venue_name: 'Orbit Studio', address: 'Hyderabad' },
    { id: 'draft', name: 'Draft', status: 'draft', start_date: '2026-10-24', start_time: '10:00' },
    { id: 'canceled', name: 'Canceled', status: 'published', registration_status: 'Cancelled', start_date: '2026-10-24', start_time: '10:00' },
    { id: 'no-venue', name: 'Needs details', status: 'published', start_date: '2026-10-24', start_time: null, attendance_mode: 'offline' },
  ], { startDate: '2026-10-24', endDate: '2026-10-25', today: '2026-10-24' })

  assert.deepEqual(update.events.map(({ event }) => event.id), ['early', 'no-venue', 'late'])
  assert.deepEqual(update.events[1].missing, ['time', 'venue'])
  assert.equal(update.events[2].date, '2026-10-25')
  assert.equal(update.events[2].time, '18:00')
  const text = weeklyUpdateText(update)
  assert.match(text, /24–25 OCTOBER 2026/)
  assert.match(text, /09:30 AM/)
  assert.match(text, /Time: Time not confirmed/)
  assert.match(text, /Venue: Venue not confirmed/)
  assert.match(weeklyUpdateCsv(update), /Earlier event/)
})

test('weekly update can include past events only when explicitly requested and separates unknown dates', () => {
  const events = [
    { id: 'past', name: 'Past event', status: 'published', start_date: '2026-10-23', start_time: '12:00', timezone: 'Asia/Kolkata' },
    { id: 'unknown', name: 'Unknown date', status: 'published', start_date: null, start_time: null },
  ]
  const excluded = createWeeklyUpdate(events, { startDate: '2026-10-23', endDate: '2026-10-25', today: '2026-10-24' })
  assert.equal(excluded.events.length, 0)
  assert.equal(excluded.dateNeedsReview.length, 1)
  const included = createWeeklyUpdate(events, { startDate: '2026-10-23', endDate: '2026-10-25', today: '2026-10-24', includePast: true })
  assert.equal(included.events.length, 1)
  assert.match(weeklyUpdateText(included), /NEEDS DATE REVIEW/)
})

test('weekend headings retain the weekend label across month and year boundaries', () => {
  const monthBoundary = createWeeklyUpdate([], {
    startDate: '2026-10-31',
    endDate: '2026-11-01',
  })
  const yearBoundary = createWeeklyUpdate([], {
    startDate: '2022-12-31',
    endDate: '2023-01-01',
  })
  assert.equal(monthBoundary.title, 'WEEKEND EVENTS — 31 OCTOBER–1 NOVEMBER 2026')
  assert.equal(yearBoundary.title, 'WEEKEND EVENTS — 31 DECEMBER 2022–1 JANUARY 2023')
})

test('hybrid events retain both confirmed venue and online details', () => {
  const update = createWeeklyUpdate([{
    id: 'hybrid',
    name: 'Hybrid meetup',
    status: 'published',
    start_date: '2026-10-24',
    start_time: '09:30',
    attendance_mode: 'mixed',
    venue_name: 'Orbit Studio',
    city: 'Hyderabad',
    online_details: 'Link shared after registration',
  }], { startDate: '2026-10-24', endDate: '2026-10-25', today: '2026-10-24' })
  assert.match(weeklyUpdateText(update), /Hybrid · Orbit Studio, Hyderabad · Online · Link shared after registration/)
})
