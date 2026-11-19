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
    const statusIn = url.searchParams.get('status')?.match(/^in\.\((.*)\)$/)
    if (statusIn) matchingEvents = matchingEvents.filter((event) => statusIn[1].split(',').includes(event.status))
    const status = statusIn ? null : url.searchParams.get('status')?.replace(/^eq\./, '')
    const slug = url.searchParams.get('slug')?.replace(/^eq\./, '')
    const deletedAtFilters = url.searchParams.getAll('deleted_at')
    if (deletedAtFilters.includes('is.null')) matchingEvents = matchingEvents.filter((event) => event.deleted_at == null)
    if (deletedAtFilters.includes('not.is.null')) matchingEvents = matchingEvents.filter((event) => event.deleted_at != null)
    const sourceUrl = url.searchParams.get('source_url')?.replace(/^eq\./, '')
    if (id?.startsWith('neq.')) matchingEvents = matchingEvents.filter((event) => event.id !== id.slice(4))
    else if (id) matchingEvents = matchingEvents.filter((event) => event.id === id)
    const sourceLike = url.searchParams.get('source_url')?.match(/^ilike\.[*%](.*)[*%]$/)
    if (sourceLike) matchingEvents = matchingEvents.filter((event) => String(event.source_url || '').toLowerCase().includes(sourceLike[1].toLowerCase()))
    if (status) matchingEvents = matchingEvents.filter((event) => event.status === status)
    if (slug) matchingEvents = matchingEvents.filter((event) => event.slug === slug)
    if (sourceUrl && !sourceLike) matchingEvents = matchingEvents.filter((event) => event.source_url === sourceUrl)
    for (const startDate of url.searchParams.getAll('start_date')) {
      if (startDate.startsWith('gte.')) matchingEvents = matchingEvents.filter((event) => event.start_date && event.start_date >= startDate.slice(4))
      if (startDate.startsWith('lte.')) matchingEvents = matchingEvents.filter((event) => event.start_date && event.start_date <= startDate.slice(4))
    }
    const startDateOr = url.searchParams.get('or')?.match(/^\(start_date\.lt\.([\d-]+),start_date\.is\.null\)$/)
    if (startDateOr) matchingEvents = matchingEvents.filter((event) => !event.start_date || event.start_date < startDateOr[1])
    const dayOr = url.searchParams.get('or')?.match(/^\(and\(start_at\.gte\.([^,]+),start_at\.lt\.([^)]+)\),and\(start_at\.is\.null,start_date\.eq\.([\d-]+)\)\)$/)
    if (dayOr) {
      const [, from, to, day] = dayOr
      matchingEvents = matchingEvents.filter((event) => (event.start_at
        ? Date.parse(event.start_at) >= Date.parse(from) && Date.parse(event.start_at) < Date.parse(to)
        : event.start_date === day))
    }
    const nameSearch = url.searchParams.get('name')?.match(/^ilike\.[*%](.*)[*%]$/)
    if (nameSearch) matchingEvents = matchingEvents.filter((event) => String(event.name || '').toLowerCase().includes(nameSearch[1].toLowerCase()))

    // PostgREST-style ordering: "col.asc|desc[.nullsfirst|.nullslast]" entries, comma separated.
    const orderKeys = (url.searchParams.get('order') || '').split(',').filter(Boolean).map((entry) => {
      const [column, direction = 'asc', nulls] = entry.split('.')
      return { column, descending: direction === 'desc', nullsFirst: nulls ? nulls === 'nullsfirst' : direction === 'desc' }
    })
    matchingEvents.sort((a, b) => {
      for (const { column, descending, nullsFirst } of orderKeys) {
        const left = a[column] ?? null
        const right = b[column] ?? null
        if (left === right) continue
        if (left === null) return nullsFirst ? -1 : 1
        if (right === null) return nullsFirst ? 1 : -1
        return (left < right ? -1 : 1) * (descending ? -1 : 1)
      }
      return 0
    })

    const total = matchingEvents.length
    const offset = Number(url.searchParams.get('offset') || 0)
    const limit = url.searchParams.has('limit') ? Number(url.searchParams.get('limit')) : Infinity
    matchingEvents = matchingEvents.slice(offset, offset + limit)
    const select = url.searchParams.get('select')
    if (select && select !== '*') {
      const columns = select.split(',')
      matchingEvents = matchingEvents.map((event) => Object.fromEntries(columns.map((column) => [column, event[column] ?? null])))
    }
    if (request.headers.prefer?.includes('count=exact')) {
      response.setHeader('Content-Range', `${matchingEvents.length ? `${offset}-${offset + matchingEvents.length - 1}` : '*'}/${total}`)
    }
    if (request.method === 'HEAD') {
      response.writeHead(200)
      return response.end()
    }
    if (request.headers.accept?.includes('vnd.pgrst.object+json')) {
      if (matchingEvents.length > 1) {
        return respond(response, 406, { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' })
      }
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
  // The public detail endpoint never selects `status`; it only serves published rows.
  assert.equal((await publicResponse.json()).data.slug, created.slug)
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

test('CORS preflights for allowed origins are cacheable and other origins stay rejected', async () => {
  const allowed = await fetch(`${baseUrl}/api/admin/events`, {
    method: 'OPTIONS',
    headers: { Origin: 'http://localhost:5173', 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'authorization' },
  })
  assert.equal(allowed.status, 204)
  assert.equal(allowed.headers.get('access-control-max-age'), '600')
  assert.equal(allowed.headers.get('access-control-allow-origin'), 'http://localhost:5173')
  const blocked = await fetch(`${baseUrl}/api/admin/events`, {
    method: 'OPTIONS',
    headers: { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'GET' },
  })
  assert.equal(blocked.status, 403)
})

test('admin list returns only list columns and rejects unsupported status, sort and direction', async () => {
  const headers = { Authorization: 'Bearer owner-token' }
  const list = await fetch(`${baseUrl}/api/admin/events?page_size=50`, { headers })
  assert.equal(list.status, 200)
  const body = (await list.json()).data
  assert.ok(body.events.length > 0)
  assert.equal(body.total, body.events.length)
  for (const event of body.events) {
    assert.ok('name' in event && 'status' in event && 'start_date' in event)
    assert.equal('description' in event, false)
    assert.equal('extraction_metadata' in event, false)
  }
  for (const query of ['status=bogus', 'sort=bogus', 'direction=sideways']) {
    const rejected = await fetch(`${baseUrl}/api/admin/events?${query}`, { headers })
    assert.equal(rejected.status, 400, query)
    assert.ok((await rejected.json()).error.message)
  }
})

test('event date ascending lists upcoming events soonest first, then past events, across pages', async () => {
  const headers = { Authorization: 'Bearer owner-token' }
  const fixtures = [
    ['30000000-0000-4000-8000-000000000001', 'sort-upcoming-later', '2099-02-01'],
    ['30000000-0000-4000-8000-000000000002', 'sort-upcoming-soon', '2099-01-01'],
    ['30000000-0000-4000-8000-000000000003', 'sort-past-recent', '2020-06-01'],
    ['30000000-0000-4000-8000-000000000004', 'sort-past-old', '2020-01-01'],
  ]
  for (const [id, slug, date] of fixtures) {
    events.set(id, { id, slug, name: `Sortcheck ${slug}`, start_date: date, timezone: 'Asia/Kolkata', status: 'draft', deleted_at: null, description: 'Detail only' })
  }
  try {
    const page = async (number) => (await (await fetch(`${baseUrl}/api/admin/events?search=Sortcheck&sort=date&direction=asc&page_size=3&page=${number}`, { headers })).json()).data
    const first = await page(1)
    const second = await page(2)
    assert.equal(first.total, 4)
    assert.equal(second.total, 4)
    assert.deepEqual(
      [...first.events, ...second.events].map((event) => event.slug),
      ['sort-upcoming-soon', 'sort-upcoming-later', 'sort-past-recent', 'sort-past-old'],
    )
    const descending = (await (await fetch(`${baseUrl}/api/admin/events?search=Sortcheck&sort=date&direction=desc`, { headers })).json()).data
    assert.deepEqual(descending.events.map((event) => event.slug), ['sort-upcoming-later', 'sort-upcoming-soon', 'sort-past-recent', 'sort-past-old'])
  } finally {
    for (const [id] of fixtures) events.delete(id)
  }
})

test('Recently Deleted can return just its count with one projected row', async () => {
  const headers = { Authorization: 'Bearer owner-token' }
  const ids = ['40000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000002']
  for (const id of ids) {
    events.set(id, { id, slug: `deleted-${id}`, name: 'Deleted count check', status: 'draft', deleted_at: new Date().toISOString(), description: 'Detail only' })
  }
  try {
    const response = await fetch(`${baseUrl}/api/admin/events/deleted?page_size=1&search=Deleted%20count`, { headers })
    assert.equal(response.status, 200)
    const body = (await response.json()).data
    assert.equal(body.total, 2)
    assert.equal(body.events.length, 1)
    assert.equal('description' in body.events[0], false)
  } finally {
    for (const id of ids) events.delete(id)
  }
})

test('import duplicate detection tolerates several events with the same source URL and prefers the active one', async () => {
  const sourceUrl = 'https://events.example.com/shared-source'
  const deletedId = '50000000-0000-4000-8000-000000000001'
  const activeId = '50000000-0000-4000-8000-000000000002'
  events.set(deletedId, { id: deletedId, slug: 'dup-deleted', name: 'Deleted copy', source_url: sourceUrl, status: 'draft', deleted_at: new Date().toISOString(), updated_at: '2026-11-10T00:00:00.000Z' })
  events.set(activeId, { id: activeId, slug: 'dup-active', name: 'Active copy', source_url: sourceUrl, status: 'published', deleted_at: null, updated_at: '2026-11-01T00:00:00.000Z' })
  try {
    const response = await fetch(`${baseUrl}/api/admin/import`, {
      method: 'POST',
      headers: { Authorization: 'Bearer owner-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: sourceUrl }),
    })
    assert.equal(response.status, 200)
    const body = (await response.json()).data
    assert.equal(body.duplicate.id, activeId)
    assert.equal(body.research.status, 'skipped_duplicate')
  } finally {
    events.delete(deletedId)
    events.delete(activeId)
  }
})

test('deleting and restoring still report missing, already-deleted and active events precisely', async () => {
  const headers = { Authorization: 'Bearer owner-token' }
  const missing = '60000000-0000-4000-8000-000000000001'
  assert.equal((await fetch(`${baseUrl}/api/admin/events/${missing}`, { method: 'DELETE', headers })).status, 404)
  assert.equal((await fetch(`${baseUrl}/api/admin/events/${missing}/restore`, { method: 'POST', headers })).status, 404)
  const id = '60000000-0000-4000-8000-000000000002'
  events.set(id, { id, slug: 'delete-twice', name: 'Delete twice', status: 'draft', deleted_at: null })
  try {
    assert.equal((await fetch(`${baseUrl}/api/admin/events/${id}/restore`, { method: 'POST', headers })).status, 409)
    assert.equal((await fetch(`${baseUrl}/api/admin/events/${id}`, { method: 'DELETE', headers })).status, 200)
    assert.equal((await fetch(`${baseUrl}/api/admin/events/${id}`, { method: 'DELETE', headers })).status, 409)
  } finally {
    events.delete(id)
  }
})

test('date filter returns events on that Asia/Kolkata day and works with search, status and paging', async () => {
  const headers = { Authorization: 'Bearer owner-token' }
  const fixtures = [
    // 23:30 IST on 14 Nov is 18:00 UTC on 14 Nov: same IST day.
    ['70000000-0000-4000-8000-000000000001', 'Daycheck late', '2026-11-14', '2026-11-14T18:00:00.000Z', 'published'],
    // 00:30 IST on 15 Nov is 19:00 UTC on 14 Nov: next IST day, must be excluded.
    ['70000000-0000-4000-8000-000000000002', 'Daycheck next', '2026-11-15', '2026-11-14T19:00:00.000Z', 'published'],
    ['70000000-0000-4000-8000-000000000003', 'Daycheck no time', '2026-11-14', null, 'draft'],
    ['70000000-0000-4000-8000-000000000004', 'Daycheck other', '2026-11-20', '2026-11-20T04:30:00.000Z', 'published'],
  ]
  for (const [id, name, date, startAt, status] of fixtures) {
    events.set(id, { id, slug: id, name, start_date: date, start_at: startAt, timezone: 'Asia/Kolkata', status, deleted_at: null })
  }
  try {
    const list = async (query) => (await (await fetch(`${baseUrl}/api/admin/events?search=Daycheck&${query}`, { headers })).json()).data
    const day = await list('date=2026-11-14&sort=date&direction=asc')
    assert.deepEqual(day.events.map((event) => event.name).sort(), ['Daycheck late', 'Daycheck no time'])
    assert.equal(day.total, 2)
    assert.deepEqual((await list('date=2026-11-14&status=published')).events.map((event) => event.name), ['Daycheck late'])
    const paged = await list('date=2026-11-14&page_size=1&page=2&sort=name&direction=asc')
    assert.equal(paged.total, 2)
    assert.deepEqual(paged.events.map((event) => event.name), ['Daycheck no time'])
    const invalid = await fetch(`${baseUrl}/api/admin/events?date=2026-13-01`, { headers })
    assert.equal(invalid.status, 400)
  } finally {
    for (const [id] of fixtures) events.delete(id)
  }
})

test('duplicate detection: imports of an existing published event or draft are stopped before extraction', async () => {
  const headers = { Authorization: 'Bearer owner-token', 'Content-Type': 'application/json' }
  const publishedId = '60000000-0000-4000-8000-000000000001'
  const draftId = '60000000-0000-4000-8000-000000000002'
  events.set(publishedId, { id: publishedId, slug: 'ai-night', name: 'AI Night Hyderabad', source_url: 'https://lu.ma/ai-night', status: 'published', start_date: '2026-12-05', deleted_at: null })
  events.set(draftId, { id: draftId, slug: 'rust-meetup', name: 'Rust Meetup', source_url: 'https://www.meetup.com/rust-hyd/events/301234567/', status: 'draft', start_date: '2026-12-06', deleted_at: null })
  try {
    // A tracking-parameter / domain-alias variant of the published event's URL.
    const published = await fetch(`${baseUrl}/api/admin/import`, { method: 'POST', headers, body: JSON.stringify({ url: 'https://luma.com/ai-night?utm_source=whatsapp' }) })
    const publishedBody = (await published.json()).data
    assert.equal(publishedBody.research.status, 'skipped_duplicate')
    assert.equal(publishedBody.duplicate.id, publishedId)
    assert.equal(publishedBody.duplicates[0].match, 'source_url')
    assert.equal(publishedBody.duplicates[0].status, 'published')

    const draft = await fetch(`${baseUrl}/api/admin/import`, { method: 'POST', headers, body: JSON.stringify({ url: 'https://meetup.com/rust-hyd/events/301234567?eventOrigin=home' }) })
    const draftBody = (await draft.json()).data
    assert.equal(draftBody.duplicate.id, draftId)
    assert.equal(draftBody.duplicate.status, 'draft')
  } finally {
    events.delete(publishedId)
    events.delete(draftId)
  }
})

test('duplicate detection: manual creation is refused with the match, and allowed after confirmation', async () => {
  const headers = { Authorization: 'Bearer owner-token', 'Content-Type': 'application/json' }
  const existingId = '60000000-0000-4000-8000-000000000003'
  events.set(existingId, { id: existingId, slug: 'k8s-workshop', name: 'Kubernetes Workshop Hyderabad', status: 'draft', start_date: '2026-12-12', start_time: '10:00', organizer_name: 'CNCF Hyderabad', deleted_at: null })
  const payload = { name: 'Kubernetes Workshop – Hyderabad', slug: 'k8s-workshop-copy', start_date: '2026-12-12', start_time: '10:30', organizer_name: 'CNCF Hyderabad', extraction_status: 'manual' }
  try {
    const refused = await fetch(`${baseUrl}/api/admin/events`, { method: 'POST', headers, body: JSON.stringify(payload) })
    assert.equal(refused.status, 409)
    const error = (await refused.json()).error
    assert.equal(error.code, 'duplicate_event')
    assert.equal(error.duplicates[0].id, existingId)
    assert.equal(error.duplicates[0].name, 'Kubernetes Workshop Hyderabad')
    assert.match(error.message, /already exists/)
    assert.equal(events.get(eventIds.created)?.slug === 'k8s-workshop-copy', false, 'nothing was written')

    const check = await fetch(`${baseUrl}/api/admin/events/check-duplicates`, { method: 'POST', headers, body: JSON.stringify(payload) })
    assert.equal((await check.json()).data.duplicates[0].id, existingId)

    const confirmed = await fetch(`${baseUrl}/api/admin/events`, { method: 'POST', headers, body: JSON.stringify({ ...payload, allow_duplicate: true }) })
    assert.equal(confirmed.status, 201)
    assert.equal((await confirmed.json()).data.allow_duplicate, undefined, 'the confirmation flag is not stored')
  } finally {
    events.delete(existingId)
  }
})

test('duplicate detection: two different events with similar titles can both be created', async () => {
  const headers = { Authorization: 'Bearer owner-token', 'Content-Type': 'application/json' }
  const existingId = '60000000-0000-4000-8000-000000000004'
  events.set(existingId, { id: existingId, slug: 'react-8', name: 'React Hyderabad Meetup #8', status: 'published', start_date: '2026-12-19', organizer_name: 'React Hyderabad', deleted_at: null })
  try {
    for (const name of ['React Hyderabad Meetup #9', 'Angular Hyderabad Meetup #8']) {
      const created = await fetch(`${baseUrl}/api/admin/events`, { method: 'POST', headers, body: JSON.stringify({ name, slug: 'similar-title', start_date: '2026-12-19', extraction_status: 'manual' }) })
      assert.equal(created.status, 201, name)
    }
  } finally {
    events.delete(existingId)
  }
})

test('duplicate detection: publishing a second live copy needs confirmation; editing and publishing others is unaffected', async () => {
  const headers = { Authorization: 'Bearer owner-token', 'Content-Type': 'application/json' }
  const liveId = '60000000-0000-4000-8000-000000000005'
  const copyId = '60000000-0000-4000-8000-000000000006'
  events.set(liveId, { id: liveId, slug: 'devfest', name: 'DevFest Hyderabad 2026', status: 'published', start_date: '2026-12-20', start_time: '09:00', timezone: 'Asia/Kolkata', deleted_at: null })
  events.set(copyId, { id: copyId, slug: 'devfest-copy', name: 'DevFest Hyderabad 2026', status: 'draft', start_date: '2026-12-20', start_time: '09:00', start_at: '2026-12-20T03:30:00.000Z', timezone: 'Asia/Kolkata', registration_status: 'InStock', deleted_at: null })
  try {
    const refused = await fetch(`${baseUrl}/api/admin/events/${copyId}/publish`, { method: 'POST', headers: { Authorization: 'Bearer owner-token' } })
    assert.equal(refused.status, 409)
    assert.equal((await refused.json()).error.duplicates[0].id, liveId)
    assert.equal(events.get(copyId).status, 'draft')

    // Editing the draft still works, and registration status values are normalised.
    const edited = await fetch(`${baseUrl}/api/admin/events/${copyId}`, { method: 'PATCH', headers, body: JSON.stringify({ registration_status: 'Join Waitlist', event_type: 'Conference' }) })
    assert.equal(edited.status, 200)
    assert.equal((await edited.json()).data.registration_status, 'waitlist')

    const confirmed = await fetch(`${baseUrl}/api/admin/events/${copyId}/publish`, { method: 'POST', headers, body: JSON.stringify({ allow_duplicate: true }) })
    assert.equal(confirmed.status, 200)
    assert.equal((await confirmed.json()).data.status, 'published')
  } finally {
    events.delete(liveId)
    events.delete(copyId)
  }
})

test('registration status is stored separately from publishing and served publicly', async () => {
  const headers = { Authorization: 'Bearer owner-token', 'Content-Type': 'application/json' }
  const id = '60000000-0000-4000-8000-000000000007'
  events.set(id, { id, slug: 'closed-but-live', name: 'Closed but live', status: 'published', start_date: '2026-12-26', timezone: 'Asia/Kolkata', registration_status: 'open', deleted_at: null })
  try {
    const cases = [['closed', 'closed'], ['sold_out', 'sold_out'], ['Waitlist', 'waitlist'], ['Open', 'open'], ['not_announced', 'not_announced'], ['', null], ['Limited seats', 'Limited seats']]
    for (const [input, stored] of cases) {
      const response = await fetch(`${baseUrl}/api/admin/events/${id}`, { method: 'PATCH', headers, body: JSON.stringify({ registration_status: input }) })
      const event = (await response.json()).data
      assert.equal(event.registration_status, stored, input)
      assert.equal(event.status, 'published', 'publishing status is untouched')
    }
    await fetch(`${baseUrl}/api/admin/events/${id}`, { method: 'PATCH', headers, body: JSON.stringify({ registration_status: 'closed' }) })
    const publicEvent = (await (await fetch(`${baseUrl}/api/events/closed-but-live`)).json()).data
    assert.equal(publicEvent.registration_status, 'closed')
  } finally {
    events.delete(id)
  }
})
