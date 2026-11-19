import assert from 'node:assert/strict'
import test from 'node:test'
import { indiaDayFilter, indiaToday, listParams, splitRange } from './adminListing.js'

test('splitRange pages across the upcoming and past groups without gaps or overlap', () => {
  assert.deepEqual(splitRange(0, 19, 50), { upcoming: [0, 19], past: null })
  assert.deepEqual(splitRange(40, 59, 50), { upcoming: [40, 49], past: [0, 9] })
  assert.deepEqual(splitRange(60, 79, 50), { upcoming: null, past: [10, 29] })
  assert.deepEqual(splitRange(0, 19, 0), { upcoming: null, past: [0, 19] })
  assert.deepEqual(splitRange(20, 39, 20), { upcoming: null, past: [0, 19] })
})

test('listParams validates enums, keeps defaults and sanitises search', () => {
  assert.deepEqual(listParams({}), { date: '', page: 1, pageSize: 20, status: '', search: '', sort: 'updated', direction: 'desc' })
  assert.equal(listParams({ page_size: '500' }).pageSize, 100)
  assert.equal(listParams({ page: '-3' }).page, 1)
  assert.equal(listParams({ search: ' 50%_off\\ ' }).search, '50off')
  assert.ok(listParams({ status: 'deleted' }).error)
  assert.ok(listParams({ sort: 'created' }).error)
  assert.ok(listParams({ direction: 'up' }).error)
  assert.equal(listParams({ status: 'published', sort: 'date', direction: 'asc' }).direction, 'asc')
})

test('indiaToday uses the Asia/Kolkata calendar date', () => {
  assert.equal(indiaToday(new Date('2026-11-12T19:00:00Z')), '2026-11-13')
  assert.equal(indiaToday(new Date('2026-11-12T18:00:00Z')), '2026-11-12')
})

test('date filter accepts real calendar dates and builds an Asia/Kolkata day range', () => {
  assert.equal(listParams({ date: '2026-11-14' }).date, '2026-11-14')
  assert.ok(listParams({ date: '2026-02-30' }).error)
  assert.ok(listParams({ date: '14-11-2026' }).error)
  assert.equal(
    indiaDayFilter('2026-11-14'),
    'and(start_at.gte.2026-11-13T18:30:00.000Z,start_at.lt.2026-11-14T18:30:00.000Z),and(start_at.is.null,start_date.eq.2026-11-14)',
  )
})
