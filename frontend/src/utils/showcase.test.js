import assert from 'node:assert/strict'
import test from 'node:test'
import {
  associationLabel,
  associationTypes,
  collaborations,
  formatCollaborationDate,
  sortCollaborations,
} from './collaborations.js'

test('formats single dates, same-month ranges and missing dates', () => {
  assert.equal(formatCollaborationDate({ startDate: '2026-10-24', endDate: null }), '24 Oct 2026')
  assert.equal(formatCollaborationDate({ startDate: '2026-10-09', endDate: '2026-10-10' }), '9–10 Oct 2026')
  assert.match(formatCollaborationDate({ startDate: '2026-09-30', endDate: '2026-10-01' }), /^30 Sept? – 1 Oct 2026$/)
  assert.equal(formatCollaborationDate({ startDate: null, endDate: null }), null)
})

test('sorts featured first, then newest, then undated', () => {
  const ids = sortCollaborations(collaborations).map((item) => item.id)
  assert.equal(ids[0], 'devfest-hyderabad-2026')
  assert.equal(ids.at(-1), 'hyderabad-pgdays-2026')
  assert.deepEqual(ids.slice(1, 3), ['ai-product-builder-workshop', 'aws-student-community-days-2026'])
})

test('records are well formed and only DevFest is an official partner', () => {
  const ids = new Set()
  for (const item of collaborations) {
    assert.ok(!ids.has(item.id), `duplicate id ${item.id}`)
    ids.add(item.id)
    assert.ok(item.association in associationTypes, `unknown association for ${item.id}`)
    assert.ok(associationLabel(item))
    assert.ok(item.partners.length > 0)
    assert.equal(item.banner, `/images/collaborations/${item.id}.webp`)
  }
  assert.deepEqual(
    collaborations.filter((item) => item.association === 'official-partner').map((item) => item.id),
    ['devfest-hyderabad-2026'],
  )
})
