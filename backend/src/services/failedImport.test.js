import assert from 'node:assert/strict'
import test from 'node:test'
import { recordUntitledImport } from './failedImport.js'

test('untitled imports are persisted as private correction-needed extraction runs', async () => {
  let stored
  const supabase = {
    from: (table) => ({
      insert: async (row) => {
        assert.equal(table, 'extraction_runs')
        stored = row
        return { error: null }
      },
    }),
  }
  const missing = await recordUntitledImport(supabase, {
    sourceUrl: 'https://events.example/meetup',
    ownerId: 'owner-id',
    extraction: {
      fields: { start_date: '2026-10-17' },
      missing_fields: ['start_date', 'timezone'],
      warnings: [{ field: 'name', message: 'Title is missing.' }],
      field_provenance: {},
      research: { status: 'unavailable' },
    },
  })

  assert.deepEqual(missing, ['name', 'start_date', 'timezone'])
  assert.equal(stored.source_url, 'https://events.example/meetup')
  assert.equal(stored.created_by, 'owner-id')
  assert.equal(stored.status, 'needs_correction')
  assert.equal(stored.extracted_data.fields.start_date, '2026-10-17')
})

test('untitled import persistence surfaces database failures', async () => {
  await assert.rejects(recordUntitledImport({
    from: () => ({ insert: async () => ({ error: new Error('database unavailable') }) }),
  }, {
    sourceUrl: 'https://events.example/meetup',
    ownerId: 'owner-id',
    extraction: { fields: {}, missing_fields: [] },
  }), /database unavailable/)
})
