import assert from 'node:assert/strict'
import test from 'node:test'
import ExcelJS from 'exceljs'
import { createEventWorkbook } from './eventWorkbook.js'

test('workbook contains event rows and related speaker, sponsor, and agenda worksheets', async () => {
  const generatedAt = new Date('2026-10-16T00:00:00.000Z')
  const buffer = await createEventWorkbook([{
    id: 'event-1',
    name: 'Workshop',
    description: 'A community event.',
    start_date: '2026-10-17',
    start_time: '09:30',
    timezone: 'Asia/Kolkata',
    status: 'published',
    speakers: [{ name: 'Asha Rao', role: 'Engineer' }],
    sponsors: [{ name: 'Orbit Labs', website: 'https://orbit.example' }],
    agenda_items: [{ title: 'Opening', start_time: '09:30' }],
  }], { generatedAt })
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer)

  assert.deepEqual(workbook.worksheets.map((worksheet) => worksheet.name), ['Events', 'Speakers', 'Sponsors', 'Agenda'])
  const events = workbook.getWorksheet('Events')
  assert.equal(events.getRow(1).getCell(1).value, `The Orbit events · Generated ${generatedAt.toISOString()}`)
  assert.equal(events.views[0].ySplit, 2)
  assert.ok(events.autoFilter)
  const eventHeaders = events.getRow(2).values
  assert.ok(eventHeaders.includes('Start date'))
  assert.ok(eventHeaders.includes('Timezone'))
  assert.ok(eventHeaders.includes('Publication status'))
  assert.equal(events.getRow(3).getCell(1).value, 'event-1')
  assert.equal(workbook.getWorksheet('Speakers').getRow(3).getCell(1).value, 'event-1')
  assert.equal(workbook.getWorksheet('Speakers').getRow(3).getCell(2).value, 'Asha Rao')
  assert.equal(workbook.getWorksheet('Sponsors').getRow(3).getCell(2).value, 'Orbit Labs')
  assert.equal(workbook.getWorksheet('Agenda').getRow(3).getCell(2).value, 'Opening')
})

test('workbook stores formula-like event text as inert strings', async () => {
  const buffer = await createEventWorkbook([{
    id: 'formula-event',
    name: '=HYPERLINK("https://bad.example","Click")',
    description: '  @SUM(1,1)',
    status: 'draft',
    speakers: [],
    sponsors: [],
    agenda_items: [],
  }])
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer)
  const events = workbook.getWorksheet('Events')
  assert.equal(events.getCell('C3').value, '\'=HYPERLINK("https://bad.example","Click")')
  assert.equal(events.getCell('D3').value, '\'  @SUM(1,1)')
  assert.equal(workbook.getWorksheet('Speakers'), undefined)
  assert.equal(workbook.getWorksheet('Sponsors'), undefined)
  assert.equal(workbook.getWorksheet('Agenda'), undefined)
})
