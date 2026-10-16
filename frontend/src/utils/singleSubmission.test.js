import assert from 'node:assert/strict'
import { test } from 'node:test'
import { runSingleSubmission } from './singleSubmission.js'

test('concurrent submit attempts run only one task until the first finishes', async () => {
  const lock = { current: false }
  let finishFirst
  let calls = 0
  const first = runSingleSubmission(lock, () => new Promise((resolve) => {
    calls += 1
    finishFirst = resolve
  }))
  const second = await runSingleSubmission(lock, async () => { calls += 1 })
  assert.equal(second, false)
  assert.equal(calls, 1)
  finishFirst()
  assert.equal(await first, true)
  assert.equal(lock.current, false)
  assert.equal(await runSingleSubmission(lock, async () => { calls += 1 }), true)
  assert.equal(calls, 2)
})
