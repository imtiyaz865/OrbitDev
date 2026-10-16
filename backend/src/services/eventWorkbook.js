import ExcelJS from 'exceljs'

const eventColumns = [
  ['id', 'Event ID'], ['slug', 'Slug'], ['name', 'Title'], ['description', 'Description'],
  ['start_date', 'Start date'], ['start_time', 'Start time'], ['end_date', 'End date'],
  ['end_time', 'End time'], ['timezone', 'Timezone'], ['start_at', 'Start instant (UTC)'],
  ['end_at', 'End instant (UTC)'], ['event_type', 'Event type'], ['tags', 'Technology tags'],
  ['attendance_mode', 'Attendance mode'], ['venue_name', 'Venue'], ['address', 'Address'],
  ['city', 'City'], ['online_details', 'Online details'], ['organizer_name', 'Organizer'],
  ['organizer_website', 'Organizer website'], ['organizer_logo_url', 'Organizer logo URL'],
  ['registration_url', 'Registration URL'], ['registration_fee_type', 'Fee type'],
  ['registration_amount', 'Fee amount'], ['registration_currency', 'Fee currency'],
  ['registration_deadline', 'Registration deadline'], ['registration_status', 'Registration status'],
  ['banner_url', 'Banner URL'], ['original_banner_url', 'Original banner URL'],
  ['source_url', 'Original event URL'], ['source_platform', 'Source platform'],
  ['source_title', 'Source title'], ['status', 'Publication status'],
  ['verification_status', 'Verification status'], ['extraction_status', 'Extraction status'],
  ['extraction_metadata', 'Extraction metadata'], ['field_provenance', 'Field provenance'],
  ['missing_fields', 'Missing fields'], ['extracted_at', 'Extracted at'],
  ['last_verified_at', 'Last verified at'], ['created_by', 'Created by'],
  ['created_at', 'Created at'], ['updated_at', 'Updated at'], ['deleted_at', 'Deleted at'],
]

const relatedWorksheets = [
  { key: 'speakers', name: 'Speakers', columns: [['name', 'Name'], ['role', 'Role'], ['organization', 'Organization'], ['biography', 'Biography'], ['image_url', 'Image URL']] },
  { key: 'sponsors', name: 'Sponsors', columns: [['name', 'Name'], ['website', 'Website'], ['logo_url', 'Logo URL']] },
  { key: 'agenda_items', name: 'Agenda', columns: [['title', 'Title'], ['start_time', 'Start time'], ['end_time', 'End time'], ['speaker_name', 'Speaker'], ['description', 'Description']] },
]

function safeCell(value) {
  if (value == null) return ''
  if (Array.isArray(value) || (typeof value === 'object' && !(value instanceof Date))) {
    value = JSON.stringify(value)
  }
  if (typeof value !== 'string') return value
  return /^[\u0000-\u0020]*[=+\-@]/.test(value) ? `'${value}` : value
}

function styleWorksheet(worksheet, columns, generatedAt, heading) {
  worksheet.addRow([`${heading} · Generated ${generatedAt.toISOString()}`])
  worksheet.addRow(columns.map(([, label]) => label))
  worksheet.views = [{ state: 'frozen', ySplit: 2 }]
  worksheet.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: columns.length } }
  worksheet.getRow(1).font = { italic: true, color: { argb: 'FF727681' } }
  worksheet.getRow(2).font = { bold: true, color: { argb: 'FFFFFFFF' } }
  worksheet.getRow(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3563FF' } }
  worksheet.getRow(2).height = 24
  worksheet.columns = columns.map(([key, label]) => ({
    key,
    width: Math.min(48, Math.max(14, label.length + 4)),
  }))
}

export async function createEventWorkbook(events, { generatedAt = new Date() } = {}) {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'The Orbit'
  workbook.created = generatedAt
  workbook.modified = generatedAt
  workbook.subject = 'The Orbit event archive'
  workbook.title = 'The Orbit event data'
  workbook.company = 'The Orbit'
  workbook.properties.date1904 = false

  const eventSheet = workbook.addWorksheet('Events')
  styleWorksheet(eventSheet, eventColumns, generatedAt, 'The Orbit events')
  for (const event of events) {
    eventSheet.addRow(eventColumns.map(([key]) => safeCell(event[key])))
  }

  for (const { key, name, columns } of relatedWorksheets) {
    const rows = events.flatMap((event) => (Array.isArray(event[key]) ? event[key] : [])
      .map((item) => ({ event_id: event.id, ...item })))
    if (!rows.length) continue
    const worksheetColumns = [['event_id', 'Event ID'], ...columns]
    const worksheet = workbook.addWorksheet(name)
    styleWorksheet(worksheet, worksheetColumns, generatedAt, `The Orbit ${name.toLowerCase()}`)
    for (const row of rows) {
      worksheet.addRow(worksheetColumns.map(([column]) => safeCell(row[column])))
    }
  }

  return Buffer.from(await workbook.xlsx.writeBuffer())
}

export const workbookColumns = Object.freeze({
  events: eventColumns.map(([key]) => key),
  related: Object.fromEntries(relatedWorksheets.map(({ key, columns }) => [key, columns.map(([column]) => column)])),
})
