const mockEventModules = import.meta.glob('../mocks/events.mock.local.js')
const weekendEventFields = [
  'id',
  'slug',
  'name',
  'event_type',
  'start_at',
  'end_at',
  'start_date',
  'start_time',
  'end_time',
  'timezone',
  'organizer_name',
  'banner_url',
]
const detailEventFields = [
  'id',
  'slug',
  'name',
  'description',
  'event_type',
  'tags',
  'start_at',
  'end_at',
  'start_date',
  'start_time',
  'end_date',
  'end_time',
  'timezone',
  'attendance_mode',
  'venue_name',
  'address',
  'city',
  'online_details',
  'organizer_name',
  'organizer_website',
  'organizer_logo_url',
  'speakers',
  'agenda_items',
  'sponsors',
  'registration_url',
  'registration_fee_type',
  'registration_amount',
  'registration_currency',
  'registration_deadline',
  'registration_status',
  'banner_url',
  'source_url',
]

async function loadMockEvents(signal) {
  if (signal?.aborted) throw new DOMException('The operation was aborted.', 'AbortError')
  const loadEvents = mockEventModules['../mocks/events.mock.local.js']
  if (!loadEvents) {
    throw new Error('Local event data is missing. Copy events.mock.example.js to events.mock.local.js in frontend/src/mocks/.')
  }

  const { mockEvents } = await loadEvents()
  if (signal?.aborted) throw new DOMException('The operation was aborted.', 'AbortError')
  if (!Array.isArray(mockEvents)) throw new Error('Local event data must export a mockEvents array.')
  return mockEvents
}

export async function getWeekendEvents(start, end, signal) {
  const events = await loadMockEvents(signal)
  return events
    .filter((event) => event.status === 'published' && event.start_date >= start && event.start_date <= end)
    .sort((left, right) => left.start_date.localeCompare(right.start_date)
      || (left.start_time || '99:99').localeCompare(right.start_time || '99:99'))
    .map((event) => Object.fromEntries(weekendEventFields.map((field) => [field, event[field] ?? null])))
}

export async function getEvent(slug, signal) {
  const events = await loadMockEvents(signal)
  const event = events.find((item) => item.status === 'published' && item.slug === slug)
  if (!event) throw new Error('Event not found.')
  return Object.fromEntries(detailEventFields.map((field) => [field, event[field] ?? null]))
}
