function toInstant(date, time) {
  return new Date(`${date}T${time}:00+05:30`).toISOString()
}

export const mockEvents = [
  {
    id: 'local-event-example',
    slug: 'local-event-example',
    name: 'Example Hyderabad Technology Meetup',
    description: 'A practical evening for Hyderabad’s technology community.\n\nAdd more detail here when you create a local-only event.',
    event_type: 'Developer Meetup',
    tags: ['Technology', 'Hyderabad'],
    start_date: '2026-11-07',
    start_time: '18:00',
    end_date: '2026-11-07',
    end_time: '20:00',
    start_at: toInstant('2026-11-07', '18:00'),
    end_at: toInstant('2026-11-07', '20:00'),
    timezone: 'Asia/Kolkata',
    attendance_mode: 'offline',
    venue_name: 'Example venue',
    address: 'Madhapur',
    city: 'Hyderabad',
    organizer_name: 'Example local organizer',
    organizer_website: null,
    organizer_logo_url: null,
    registration_url: null,
    registration_fee_type: 'free',
    registration_amount: null,
    registration_currency: 'INR',
    registration_status: 'Registration open',
    banner_url: null,
    speakers: [],
    agenda_items: [],
    sponsors: [],
    status: 'published',
    source_url: null,
  },
]
