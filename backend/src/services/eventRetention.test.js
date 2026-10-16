import assert from 'node:assert/strict'
import test from 'node:test'
import { purgeExpiredEvents } from './eventRetention.js'

test('retention cleanup calls the database expiry function and returns its deletion count', async () => {
  let call
  const deleted = await purgeExpiredEvents({
    rpc: async (...arguments_) => {
      call = arguments_
      return { data: 3, error: null }
    },
  }, new Date('2026-10-16T04:30:00.000Z'))

  assert.equal(deleted, 3)
  assert.equal(call[0], 'purge_expired_events')
  assert.equal(call[1].p_now, '2026-10-16T04:30:00.000Z')
})

test('retention cleanup surfaces database errors', async () => {
  await assert.rejects(
    purgeExpiredEvents({ rpc: async () => ({ data: null, error: new Error('database unavailable') }) }),
    /database unavailable/,
  )
})
