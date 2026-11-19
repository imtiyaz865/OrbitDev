import assert from 'node:assert/strict'
import test from 'node:test'
import { pageItems } from './pagination.js'

test('shows every page when there are only a few', () => {
  assert.deepEqual(pageItems(1, 1), [1])
  assert.deepEqual(pageItems(2, 4), [1, 2, 3, 4])
  assert.deepEqual(pageItems(3, 5), [1, 2, 3, 4, 5])
  assert.deepEqual(pageItems(1, 0), [])
})

test('uses gaps for large page counts and keeps the current page with its neighbours', () => {
  assert.deepEqual(pageItems(1, 20), [1, 2, 3, 4, 'gap', 20])
  assert.deepEqual(pageItems(10, 20), [1, 'gap', 9, 10, 11, 'gap', 20])
  assert.deepEqual(pageItems(20, 20), [1, 'gap', 17, 18, 19, 20])
  assert.deepEqual(pageItems(4, 20), [1, 2, 3, 4, 5, 'gap', 20])
})

test('fills a single skipped page instead of showing an ellipsis', () => {
  assert.deepEqual(pageItems(4, 7), [1, 2, 3, 4, 5, 6, 7])
  assert.deepEqual(pageItems(5, 9), [1, 'gap', 4, 5, 6, 'gap', 9])
  assert.deepEqual(pageItems(99, 4), [1, 2, 3, 4], 'out-of-range current page is clamped')
})
