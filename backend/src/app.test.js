import assert from 'node:assert/strict'
import { createServer as createHttpServer } from 'node:http'
import { after, before, test } from 'node:test'
import { once } from 'node:events'
import { createApp } from './app.js'
import { safeFetchPage } from './services/safeFetch.js'
import { parseEventHtml } from './services/extractEvent.js'

let server
let supabaseServer
let baseUrl
let supabaseUrl
let failEventWrite = false

const eventIds = {
  privateDraft: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  missingTimezone: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  missingDate: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  invalidTimezone: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  created: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  databaseTime: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
}

const users = {
  'owner-token': { id: 'owner-user', email: 'owner@example.com' },
  'admin-token': { id: 'admin-user', email: 'admin@example.com' },
  'wrong-email-token': { id: 'wrong-email-user', email: 'other@example.com' },
}
const profiles = {
  'owner-user': { id: 'owner-user', role: 'owner' },
  'admin-user': { id: 'admin-user', role: 'admin' },
  'wrong-email-user': { id: 'wrong-email-user', role: 'owner' },
}
const events = new Map([
  [eventIds.privateDraft, { id: eventIds.privateDraft, slug: 'private-draft', name: 'Private draft', description: 'Keep this description.', start_date: '2026-10-17', start_time: '09:00:00', start_at: '2026-10-17T03:30:00.000Z', timezone: 'Asia/Kolkata', status: 'draft', deleted_at: null }],
  [eventIds.missingTimezone, { id: eventIds.missingTimezone, slug: 'missing-timezone', name: 'Needs timezone', start_date: '2026-10-17', timezone: null, status: 'draft' }],
  [eventIds.missingDate, { id: eventIds.missingDate, slug: 'missing-date', name: 'Needs date', start_date: null, timezone: 'Asia/Kolkata', status: 'draft' }],
  [eventIds.invalidTimezone, { id: eventIds.invalidTimezone, slug: 'invalid-timezone', name: 'Invalid timezone', start_date: '2026-10-17', timezone: 'Mars/Olympus', status: 'draft' }],
  [eventIds.databaseTime, { id: eventIds.databaseTime, slug: 'database-time', name: 'Database time event', start_date: '2026-10-17', start_time: '09:30:00', start_at: '2026-10-17T04:00:00.000Z', timezone: 'Asia/Kolkata', status: 'draft', deleted_at: null }],
  ['11111111-1111-4111-8111-111111111111', { id: '11111111-1111-4111-8111-111111111111', slug: 'soft-deleteable-event', name: 'A published listing', start_date: '2026-10-17', timezone: 'Asia/Kolkata', status: 'published', deleted_at: null }],
])

function respond(response, status, value) {
  response.writeHead(status, { 'Content-Type': 'application/json' })
  response.end(JSON.stringify(value))
}

async function requestBody(request) {
  const chunks = []
  for await (const chunk of request) chunks.push(chunk)
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {}
}

before(async () => {
  supabaseServer = createHttpServer(async (request, response) => {
    const url = new URL(request.url, supabaseUrl)
    if (url.pathname === '/auth/v1/user') {
      const token = request.headers.authorization?.slice('Bearer '.length)
      const user = users[token]
      return user
        ? respond(response, 200, { ...user, aud: 'authenticated', role: 'authenticated' })
        : respond(response, 401, { message: 'Invalid token' })
    }
    if (url.pathname === '/rest/v1/profiles') {
      const userId = url.searchParams.get('id')?.replace(/^eq\./, '')
      return profiles[userId]
        ? respond(response, 200, profiles[userId])
        : respond(response, 406, { code: 'PGRST116', message: 'Profile not found' })
    }
    if (url.pathname.startsWith('/rest/v1/rpc/')) {
      const payload = await requestBody(request)
      const rpc = url.pathname.split('/').pop()
      const event = events.get(payload.p_event_id)
      if (rpc === 'soft_delete_event') {
        if (!event || event.deleted_at) return respond(response, 200, [])
        event.deleted_at = payload.p_now
        event.updated_at = payload.p_now
        return respond(response, 200, [event])
      }
      if (rpc === 'restore_event') {
        if (!event?.deleted_at || Date.parse(event.deleted_at) < Date.parse(payload.p_now) - 30 * 86400000) return respond(response, 200, [])
        event.deleted_at = null
        event.updated_at = payload.p_now
        return respond(response, 200, [event])
      }
      if (rpc === 'permanently_delete_event') {
        if (!event?.deleted_at) return respond(response, 200, false)
        events.delete(event.id)
        return respond(response, 200, true)
      }
      return respond(response, 404, { message: 'Unknown RPC' })
    }
    if (url.pathname !== '/rest/v1/events') return respond(response, 404, { message: 'Not found' })

    if (request.method === 'POST') {
      const payload = await requestBody(request)
      const event = { ...payload, id: eventIds.created, status: 'draft' }
      events.set(event.id, event)
      return respond(response, 201, event)
    }

    const id = url.searchParams.get('id')?.replace(/^eq\./, '')
    if (request.method === 'PATCH') {
      if (failEventWrite) {
        failEventWrite = false
        return respond(response, 400, {
          code: '23514',
          constraint: 'published_event_has_required_fields',
          message: 'Internal constraint details must not be returned.',
        })
      }
      const event = events.get(id)
      if (!event) return respond(response, 404, { code: 'PGRST116', message: 'Event not found' })
      Object.assign(event, await requestBody(request))
      return respond(response, 200, event)
    }

    let matchingEvents = [...events.values()]
    const status = url.searchParams.get('status')?.replace(/^eq\./, '')
    const slug = url.searchParams.get('slug')?.replace(/^eq\./, '')
    const deletedAt = url.searchParams.get('deleted_at')
    if (deletedAt === 'is.null') matchingEvents = matchingEvents.filter((event) => event.deleted_at == null)
    if (deletedAt === 'not.is.null') matchingEvents = matchingEvents.filter((event) => event.deleted_at != null)
    const sourceUrl = url.searchParams.get('source_url')?.replace(/^eq\./, '')
    if (id) matchingEvents = matchingEvents.filter((event) => event.id === id)
    if (status) matchingEvents = matchingEvents.filter((event) => event.status === status)
    if (slug) matchingEvents = matchingEvents.filter((event) => event.slug === slug)
    if (sourceUrl) matchingEvents = matchingEvents.filter((event) => event.source_url === sourceUrl)
    if (request.headers.accept?.includes('vnd.pgrst.object+json')) {
      return matchingEvents[0]
        ? respond(response, 200, matchingEvents[0])
        : respond(response, 406, { code: 'PGRST116', message: 'Event not found' })
    }
    return respond(response, 200, matchingEvents)
  })
  supabaseServer.listen(0)
  await once(supabaseServer, 'listening')
  supabaseUrl = `http://127.0.0.1:${supabaseServer.address().port}`
  process.env.SUPABASE_URL = supabaseUrl
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-server-key'
  process.env.OWNER_EMAIL = 'owner@example.com'
  server = createApp().listen(0)
  await once(server, 'listening')
  baseUrl = `http://127.0.0.1:${server.address().port}`
})

after(async () => {
  await Promise.all([server, supabaseServer].map((httpServer) => new Promise((resolve, reject) => {
    httpServer.close((error) => error ? reject(error) : resolve())
  })))
})

test('health endpoint is public and reports the API status', async () => {
  const response = await fetch(`${baseUrl}/api/health`)
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { data: { status: 'ok' } })
})

test('development CORS permits the loopback frontend origin', async () => {
  const response = await fetch(`${baseUrl}/api/health`, { headers: { Origin: 'http://127.0.0.1:5173' } })
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('access-control-allow-origin'), 'http://127.0.0.1:5173')
})

test('admin endpoints reject requests without an owner access token', async () => {
  const response = await fetch(`${baseUrl}/api/admin/events`)
  assert.equal(response.status, 401)
  assert.equal((await response.json()).error.message, 'Sign in to continue.')
})

test('admin event routes reject malformed UUIDs with a useful validation error', async () => {
  const response = await fetch(`${baseUrl}/api/admin/events/not-a-uuid`, {
    headers: { Authorization: 'Bearer owner-token' },
  })
  assert.equal(response.status, 400)
  assert.equal((await response.json()).error.message, 'Event ID must be a valid UUID.')
})

test('owner can publish an event whose time is returned by Supabase with seconds', async () => {
  const response = await fetch(`${baseUrl}/api/admin/events/${eventIds.databaseTime}/publish`, {
    method: 'POST',
    headers: { Authorization: 'Bearer owner-token' },
  })
  assert.equal(response.status, 200)
  assert.equal((await response.json()).data.status, 'published')
})

test('export and report actions reject authenticated non-owners', async () => {
  for (const path of ['/api/admin/export/events.xlsx', '/api/admin/reports/send']) {
    const response = await fetch(`${baseUrl}${path}`, {
      method: path.endsWith('/send') ? 'POST' : 'GET',
      headers: { Authorization: 'Bearer admin-token' },
    })
    assert.equal(response.status, 403)
  }
})

test('event import is protected before processing any submitted URL', async () => {
  const response = await fetch(`${baseUrl}/api/admin/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: 'http://127.0.0.1/' }),
  })
  assert.equal(response.status, 401)
})

test('source fetch rejects private IP addresses before making a request', async () => {
  await assert.rejects(safeFetchPage('http://127.0.0.1/'), (error) => error.status === 400)
  await assert.rejects(safeFetchPage('http://10.0.0.1/'), (error) => error.status === 400)
})

test('source fetch rejects unsupported protocols', async () => {
  await assert.rejects(safeFetchPage('file:///etc/passwd'), (error) => error.status === 400)
})

test('event extraction normalizes structured event metadata without inventing fields', () => {
  const html = `<!doctype html><html><head>
    <title>Community event source</title>
    <meta property="og:image" content="/images/event-banner.jpg">
    <script type="application/ld+json">
      {"@context":"https://schema.org","@type":"Event","name":"Open Web Workshop",
       "description":"A public workshop.","startDate":"2026-10-17T09:30:00+05:30",
       "endDate":"2026-10-17T12:00:00+05:30","eventSchedule":[{"scheduleTimezone":"Asia/Kolkata"}],
       "eventAttendanceMode":"https://schema.org/OfflineEventAttendanceMode",
       "location":{"@type":"Place","name":"Orbit Studio","address":{"@type":"PostalAddress","streetAddress":"12 Main Road","addressLocality":"Pune"}},
       "organizer":{"@type":"Organization","name":"Open Web Community","url":"https://community.example","logo":{"url":"/images/logo.png"}},
       "performer":{"@type":"Person","name":"Asha Rao","jobTitle":"Engineer"},
       "subEvent":{"@type":"Event","name":"Build session","startDate":"2026-10-17T10:00:00+05:30"},
       "sponsor":{"@type":"Organization","name":"Example Sponsor","url":"https://sponsor.example"},
       "offers":{"url":"https://tickets.example/register","price":"25","priceCurrency":"INR","validThrough":"2026-10-16T23:59:00+05:30"}}
    </script></head><body><h1>Open Web Workshop</h1></body></html>`
  const result = parseEventHtml(html, 'https://lu.ma/open-web', 'https://events.example/open-web')
  assert.equal(result.fields.name, 'Open Web Workshop')
  assert.equal(result.fields.start_date, '2026-10-17')
  assert.equal(result.fields.start_time, '09:30')
  assert.equal(result.fields.start_at, '2026-10-17T04:00:00.000Z')
  assert.equal(result.fields.end_date, '2026-10-17')
  assert.equal(result.fields.end_time, '12:00')
  assert.equal(result.fields.timezone, 'Asia/Kolkata')
  assert.equal(result.fields.city, 'Pune')
  assert.equal(result.fields.source_url, 'https://lu.ma/open-web')
  assert.equal(result.fields.source_platform, 'Luma')
  assert.equal(result.fields.banner_url, 'https://events.example/images/event-banner.jpg')
  assert.equal(result.fields.registration_fee_type, 'paid')
  assert.equal(result.fields.registration_currency, 'INR')
  assert.equal(result.fields.speakers[0].name, 'Asha Rao')
  assert.equal(result.fields.agenda_items[0].title, 'Build session')
  assert.equal(result.fields.sponsors[0].name, 'Example Sponsor')
  assert.equal(result.missing_fields.length, 0)
  assert.deepEqual(result.warnings, [])
})

test('event extraction reads common metadata and human-readable date/time formats', () => {
  const html = `<html><head>
    <meta property="event:start_time" content="October 17, 2026, 9:30 AM">
    <meta property="event:end_time" content="2026-10-17T12:00:00+05:30">
    <meta name="timezone" content="Asia/Kolkata">
  </head><body><h1>Community event</h1></body></html>`
  const result = parseEventHtml(html, 'https://example.org/event')
  assert.equal(result.fields.start_date, '2026-10-17')
  assert.equal(result.fields.start_time, '09:30')
  assert.equal(result.fields.start_at, '2026-10-17T04:00:00.000Z')
  assert.equal(result.fields.end_date, '2026-10-17')
  assert.equal(result.fields.end_time, '12:00')
  assert.equal(result.fields.end_at, '2026-10-17T06:30:00.000Z')
  assert.equal(result.fields.timezone, 'Asia/Kolkata')
})

test('event extraction interprets an offset-free local time in the India default timezone', () => {
  const result = parseEventHtml('<time itemprop="startDate" datetime="2026-10-17T09:30">October 17</time>', 'https://example.org/event')
  assert.equal(result.fields.start_date, '2026-10-17')
  assert.equal(result.fields.start_time, '09:30')
  assert.equal(result.fields.start_at, '2026-10-17T04:00:00.000Z')
  assert.equal(result.fields.timezone, 'Asia/Kolkata')
  assert.ok(result.warnings.some(({ field }) => field === 'timezone'))
})

test('event extraction converts an explicitly non-India source timezone without losing local date boundaries', () => {
  const html = `<script type="application/ld+json">{"@type":"Event","name":"Late source event",
    "startDate":"2026-10-17T23:30","endDate":"2026-10-18T01:00",
    "eventSchedule":{"scheduleTimezone":"America/New_York"}}</script>`
  const result = parseEventHtml(html, 'https://example.org/event')
  assert.equal(result.fields.start_date, '2026-10-18')
  assert.equal(result.fields.start_time, '09:00')
  assert.equal(result.fields.start_at, '2026-10-18T03:30:00.000Z')
  assert.equal(result.fields.end_date, '2026-10-18')
  assert.equal(result.fields.end_time, '10:30')
  assert.equal(result.fields.end_at, '2026-10-18T05:00:00.000Z')
  assert.equal(result.fields.timezone, 'Asia/Kolkata')
  assert.ok(result.warnings.some(({ field }) => field === 'timezone' && /converted/.test(result.warnings.find((warning) => warning.field === field).message)))
  assert.ok(result.missing_fields.includes('timezone'))
})

test('event extraction flags an ambiguous daylight-saving source time for manual review', () => {
  const html = `<script type="application/ld+json">{"@type":"Event","name":"Ambiguous local event",
    "startDate":"2026-11-01T01:30","eventSchedule":{"scheduleTimezone":"America/New_York"}}</script>`
  const result = parseEventHtml(html, 'https://example.org/event')
  assert.equal(result.fields.start_date, '2026-11-01')
  assert.equal(result.fields.start_time, null)
  assert.equal(result.fields.start_at, null)
  assert.ok(result.missing_fields.includes('start_time'))
  assert.ok(result.missing_fields.includes('timezone'))
  assert.ok(result.warnings.some(({ field, message }) => field === 'start_time' && /unambiguously/.test(message)))
})

test('event extraction preserves a cross-midnight local date and explicit end timestamp', () => {
  const html = `<script type="application/ld+json">{"@type":"Event","name":"Overnight event",
    "startDate":"2026-10-17T23:30:00+05:30","endDate":"2026-10-18T01:00:00+05:30",
    "eventSchedule":{"scheduleTimezone":"Asia/Kolkata"}}</script>`
  const result = parseEventHtml(html, 'https://example.org/overnight')
  assert.equal(result.fields.start_date, '2026-10-17')
  assert.equal(result.fields.start_time, '23:30')
  assert.equal(result.fields.start_at, '2026-10-17T18:00:00.000Z')
  assert.equal(result.fields.end_date, '2026-10-18')
  assert.equal(result.fields.end_time, '01:00')
  assert.equal(result.fields.end_at, '2026-10-17T19:30:00.000Z')
  assert.equal(result.fields.timezone, 'Asia/Kolkata')
})

test('metadata extraction leaves absent event data unknown', () => {
  const result = parseEventHtml('<html><head><title>Community homepage</title></head></html>', 'https://example.org/')
  assert.equal(result.fields.start_date, null)
  assert.equal(result.fields.timezone, 'Asia/Kolkata')
  assert.equal(result.fields.registration_amount, null)
  assert.ok(result.missing_fields.includes('start_date'))
  assert.ok(result.missing_fields.includes('timezone'))
  assert.ok(result.warnings.some(({ field }) => field === 'start_date'))
  assert.ok(result.warnings.some(({ field }) => field === 'timezone'))
})

test('event extraction warns on malformed and ambiguous dates without inventing values', () => {
  for (const startDate of ['2026-02-30T09:30:00+05:30', '10/11/2026']) {
    const html = `<script type="application/ld+json">{"@type":"Event","name":"Unknown date","startDate":"${startDate}"}</script>`
    const result = parseEventHtml(html, 'https://example.org/event')
    assert.equal(result.fields.start_date, null)
    assert.equal(result.fields.start_time, null)
    assert.equal(result.fields.start_at, null)
    assert.ok(result.warnings.some(({ field }) => field === 'start_date'))
  }
})

test('owner can create a draft and publish it using the verified access token', async () => {
  const headers = { Authorization: 'Bearer owner-token', 'Content-Type': 'application/json' }
  const createdResponse = await fetch(`${baseUrl}/api/admin/events`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      name: 'Published event',
      slug: 'published-event',
      start_date: '2026-10-17',
      start_time: '23:30',
      end_date: '2026-10-18',
      end_time: '01:00',
      extraction_status: 'manual',
    }),
  })
  assert.equal(createdResponse.status, 201)
  const created = (await createdResponse.json()).data
  assert.equal(created.status, 'draft')
  assert.equal(created.created_by, 'owner-user')
  assert.equal(created.timezone, 'Asia/Kolkata')
  assert.equal(created.start_at, '2026-10-17T18:00:00.000Z')
  assert.equal(created.end_at, '2026-10-17T19:30:00.000Z')

  const listResponse = await fetch(`${baseUrl}/api/admin/events`, {
    headers: { Authorization: 'Bearer owner-token' },
  })
  assert.equal(listResponse.status, 200)
  assert.ok((await listResponse.json()).data.events.some((event) => event.id === created.id))

  const detailResponse = await fetch(`${baseUrl}/api/admin/events/${created.id}`, {
    headers: { Authorization: 'Bearer owner-token' },
  })
  assert.equal(detailResponse.status, 200)
  assert.equal((await detailResponse.json()).data.id, created.id)

  const updateResponse = await fetch(`${baseUrl}/api/admin/events/${created.id}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ start_date: '2026-10-17', timezone: 'Asia/Kolkata' }),
  })
  assert.equal(updateResponse.status, 200)

  const publishResponse = await fetch(`${baseUrl}/api/admin/events/${created.id}/publish`, {
    method: 'POST',
    headers: { Authorization: 'Bearer owner-token' },
  })
  assert.equal(publishResponse.status, 200)
  assert.equal((await publishResponse.json()).data.status, 'published')

  const publicResponse = await fetch(`${baseUrl}/api/events/${created.slug}`)
  assert.equal(publicResponse.status, 200)
  assert.equal((await publicResponse.json()).data.status, 'published')
  const publishedEditResponse = await fetch(`${baseUrl}/api/admin/events/${created.id}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ name: 'Edited published event' }),
  })
  assert.equal(publishedEditResponse.status, 200)
  assert.equal((await publishedEditResponse.json()).data.status, 'published')
  const refreshedPublicResponse = await fetch(`${baseUrl}/api/events/${created.slug}`)
  assert.equal((await refreshedPublicResponse.json()).data.name, 'Edited published event')
  const privateResponse = await fetch(`${baseUrl}/api/events/private-draft`)
  assert.equal(privateResponse.status, 404)
})

test('imported drafts do not receive a guessed fallback timezone and invalid overnight ranges are rejected', async () => {
  const headers = { Authorization: 'Bearer owner-token', 'Content-Type': 'application/json' }
  const imported = await fetch(`${baseUrl}/api/admin/events`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      name: 'Imported event',
      slug: 'imported-event',
      extraction_status: 'extracted',
      start_date: '2026-10-17',
      start_time: '23:30',
      end_time: '01:00',
    }),
  })
  assert.equal(imported.status, 201)
  const importedEvent = (await imported.json()).data
  assert.equal(importedEvent.timezone ?? null, null)
  assert.equal(importedEvent.start_at, null)
  assert.equal(importedEvent.end_at ?? null, null)

  const invalidRange = await fetch(`${baseUrl}/api/admin/events`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      name: 'Missing end date',
      slug: 'missing-end-date',
      start_date: '2026-10-17',
      start_time: '23:30',
      end_time: '01:00',
    }),
  })
  assert.equal(invalidRange.status, 201)
  const savedIncomplete = (await invalidRange.json()).data
  const publishRange = await fetch(`${baseUrl}/api/admin/events/${savedIncomplete.id}/publish`, {
    method: 'POST',
    headers: { Authorization: 'Bearer owner-token' },
  })
  assert.equal(publishRange.status, 422)
  assert.match((await publishRange.json()).error.message, /end date/)
})

test('publishing rejects records missing migration-required fields', async () => {
  const response = await fetch(`${baseUrl}/api/admin/events/${eventIds.missingTimezone}/publish`, {
    method: 'POST',
    headers: { Authorization: 'Bearer owner-token' },
  })
  assert.equal(response.status, 422)
  assert.match((await response.json()).error.message, /timezone/)
  assert.equal(events.get(eventIds.missingTimezone).status, 'draft')

  const invalidTimezone = await fetch(`${baseUrl}/api/admin/events/${eventIds.invalidTimezone}/publish`, {
    method: 'POST',
    headers: { Authorization: 'Bearer owner-token' },
  })
  assert.equal(invalidTimezone.status, 422)
  assert.match((await invalidTimezone.json()).error.message, /IANA timezone/)
  assert.equal(events.get(eventIds.invalidTimezone).status, 'draft')

  const missingDate = await fetch(`${baseUrl}/api/admin/events/${eventIds.missingDate}/publish`, {
    method: 'POST',
    headers: { Authorization: 'Bearer owner-token' },
  })
  assert.equal(missingDate.status, 422)
  assert.match((await missingDate.json()).error.message, /start date/)
  assert.equal(events.get(eventIds.missingDate).status, 'draft')
})

test('publishing rejects invalid sessions and users without owner profile and email', async () => {
  const invalidToken = await fetch(`${baseUrl}/api/admin/events/${eventIds.privateDraft}/publish`, {
    method: 'POST',
    headers: { Authorization: 'Bearer expired-token' },
  })
  assert.equal(invalidToken.status, 401)

  const nonOwner = await fetch(`${baseUrl}/api/admin/events/${eventIds.privateDraft}/publish`, {
    method: 'POST',
    headers: { Authorization: 'Bearer admin-token' },
  })
  assert.equal(nonOwner.status, 403)

  const mismatchedEmail = await fetch(`${baseUrl}/api/admin/events/${eventIds.privateDraft}/publish`, {
    method: 'POST',
    headers: { Authorization: 'Bearer wrong-email-token' },
  })
  assert.equal(mismatchedEmail.status, 403)
  assert.equal(events.get(eventIds.privateDraft).status, 'draft')
})

test('publishing returns a safe actionable error for database constraint failures', async () => {
  failEventWrite = true
  const response = await fetch(`${baseUrl}/api/admin/events/${eventIds.privateDraft}/publish`, {
    method: 'POST',
    headers: { Authorization: 'Bearer owner-token' },
  })
  assert.equal(response.status, 422)
  const message = (await response.json()).error.message
  assert.match(message, /name, start date, and IANA timezone/)
  assert.doesNotMatch(message, /Internal constraint details/)
  assert.equal(events.get(eventIds.privateDraft).status, 'draft')
})

test('owner can update partial event fields without clearing omitted data or changing local event time', async () => {
  const response = await fetch(`${baseUrl}/api/admin/events/${eventIds.privateDraft}`, {
    method: 'PATCH',
    headers: { Authorization: 'Bearer owner-token', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Revised workshop',
      start_date: '2026-10-18',
      start_time: '09:30',
      timezone: 'Asia/Kolkata',
      speakers: [{ name: 'Asha Rao', role: 'Engineer' }],
      sponsors: [{ name: 'Orbit Labs', website: 'https://orbit.example' }],
      agenda_items: [{ title: 'Welcome', start_time: '09:30', end_time: '10:00' }],
    }),
  })
  assert.equal(response.status, 200)
  const updated = (await response.json()).data
  assert.equal(updated.name, 'Revised workshop')
  assert.equal(updated.description, 'Keep this description.')
  assert.equal(updated.start_date, '2026-10-18')
  assert.equal(updated.start_time, '09:30')
  assert.equal(updated.start_at, '2026-10-18T04:00:00.000Z')
  assert.equal(updated.speakers[0].role, 'Engineer')
  assert.equal(updated.sponsors[0].name, 'Orbit Labs')
  assert.equal(updated.agenda_items[0].title, 'Welcome')
  assert.equal(updated.status, 'draft')
})

test('owner can edit event times read back from Supabase', async () => {
  const response = await fetch(`${baseUrl}/api/admin/events/${eventIds.privateDraft}`, {
    method: 'PATCH',
    headers: { Authorization: 'Bearer owner-token', 'Content-Type': 'application/json' },
    body: JSON.stringify({ start_time: '09:30:00', end_time: '10:00:00' }),
  })
  assert.equal(response.status, 200)
  const updated = (await response.json()).data
  assert.equal(updated.start_time, '09:30')
  assert.equal(updated.end_time, '10:00')
})

test('event update rejects invalid fields and reports database errors without a success response', async () => {
  const invalid = await fetch(`${baseUrl}/api/admin/events/${eventIds.privateDraft}`, {
    method: 'PATCH',
    headers: { Authorization: 'Bearer owner-token', 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: '', start_date: '2026-02-30' }),
  })
  assert.equal(invalid.status, 400)
  assert.match((await invalid.json()).error.message, /name|start_date/)

  failEventWrite = true
  const failed = await fetch(`${baseUrl}/api/admin/events/${eventIds.privateDraft}`, {
    method: 'PATCH',
    headers: { Authorization: 'Bearer owner-token', 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Database fails' }),
  })
  assert.equal(failed.status, 422)
  assert.equal(events.get(eventIds.privateDraft).name, 'Revised workshop')
})

test('event update remains owner-only', async () => {
  const response = await fetch(`${baseUrl}/api/admin/events/${eventIds.privateDraft}`, {
    method: 'PATCH',
    headers: { Authorization: 'Bearer admin-token', 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Unauthorized change' }),
  })
  assert.equal(response.status, 403)
  assert.equal(events.get(eventIds.privateDraft).name, 'Revised workshop')
})

test('soft-deleted published events disappear publicly and can be restored without changing publication status', async () => {
  const id = '11111111-1111-4111-8111-111111111111'
  const before = await fetch(`${baseUrl}/api/events/soft-deleteable-event`)
  assert.equal(before.status, 200)

  const deleted = await fetch(`${baseUrl}/api/admin/events/${id}`, {
    method: 'DELETE',
    headers: { Authorization: 'Bearer owner-token' },
  })
  assert.equal(deleted.status, 200)
  assert.ok((await deleted.json()).data.deleted_at)
  assert.equal(events.get(id).status, 'published')
  assert.equal((await fetch(`${baseUrl}/api/events/soft-deleteable-event`)).status, 404)

  const trash = await fetch(`${baseUrl}/api/admin/events/deleted`, {
    headers: { Authorization: 'Bearer owner-token' },
  })
  assert.equal(trash.status, 200)
  assert.ok((await trash.json()).data.events.some((event) => event.id === id))

  const restored = await fetch(`${baseUrl}/api/admin/events/${id}/restore`, {
    method: 'POST',
    headers: { Authorization: 'Bearer owner-token' },
  })
  assert.equal(restored.status, 200)
  assert.equal((await restored.json()).data.status, 'published')
  assert.equal(events.get(id).deleted_at, null)
  assert.equal((await fetch(`${baseUrl}/api/events/soft-deleteable-event`)).status, 200)
})

test('restore expires after 30 days and permanent deletion refuses active events', async () => {
  const expiredId = '22222222-2222-4222-8222-222222222222'
  events.set(expiredId, {
    id: expiredId, slug: 'expired-event', name: 'Expired event',
    status: 'draft', deleted_at: new Date(Date.now() - 31 * 86400000).toISOString(),
  })
  const expired = await fetch(`${baseUrl}/api/admin/events/${expiredId}/restore`, {
    method: 'POST',
    headers: { Authorization: 'Bearer owner-token' },
  })
  assert.equal(expired.status, 410)

  const active = await fetch(`${baseUrl}/api/admin/events/${eventIds.privateDraft}/permanent`, {
    method: 'DELETE',
    headers: { Authorization: 'Bearer owner-token' },
  })
  assert.equal(active.status, 409)
  assert.ok(events.has(eventIds.privateDraft))
})

test('unauthorized deletion is rejected before the event changes', async () => {
  const response = await fetch(`${baseUrl}/api/admin/events/11111111-1111-4111-8111-111111111111`, {
    method: 'DELETE',
    headers: { Authorization: 'Bearer admin-token' },
  })
  assert.equal(response.status, 403)
  assert.equal(events.get('11111111-1111-4111-8111-111111111111').deleted_at, null)
})

test('import failures are returned without creating an event', async () => {
  const eventCount = events.size
  const response = await fetch(`${baseUrl}/api/admin/import`, {
    method: 'POST',
    headers: { Authorization: 'Bearer owner-token', 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: 'http://127.0.0.1/' }),
  })
  assert.equal(response.status, 400)
  assert.match((await response.json()).error.message, /Private and reserved/)
  assert.equal(events.size, eventCount)
})
