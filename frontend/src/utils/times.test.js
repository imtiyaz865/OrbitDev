import assert from 'node:assert/strict'
import test from 'node:test'
import { eventDateInIndia, eventTimeInIndia, format12HourTime, parseTimeInput } from './times.js'

test('12-hour input parsing and formatting handles morning, noon, evening, and midnight', () => {
  for (const [input, stored, output] of [
    ['09:00 AM', '09:00', '09:00 AM'],
    ['12:00 PM', '12:00', '12:00 PM'],
    ['01:30 PM', '13:30', '01:30 PM'],
    ['06:45 PM', '18:45', '06:45 PM'],
    ['12:30 AM', '00:30', '12:30 AM'],
  ]) {
    assert.equal(parseTimeInput(input), stored)
    assert.equal(format12HourTime(stored), output)
  }
})

test('existing database time precision is normalized without accepting nonzero seconds', () => {
  assert.equal(parseTimeInput('16:45:00.000000'), '16:45')
  assert.equal(parseTimeInput('16:45:01'), '')
  assert.equal(parseTimeInput('13:45 PM'), '')
})

test('events with offsets are represented on the Hyderabad local date and time', () => {
  const event = {
    start_at: '2026-10-18T03:30:00.000Z',
    end_at: '2026-10-18T06:30:00.000Z',
  }
  assert.equal(eventDateInIndia(event), '2026-10-18')
  assert.equal(eventTimeInIndia(event), '09:00')
  assert.equal(eventTimeInIndia(event, 'end'), '12:00')
})

test('events without timestamps retain their stored local date and time', () => {
  const event = { start_date: '2026-10-24', start_time: '18:45:00', timezone: 'Asia/Kolkata' }
  assert.equal(eventDateInIndia(event), '2026-10-24')
  assert.equal(eventTimeInIndia(event), '18:45')
})
