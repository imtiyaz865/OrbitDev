import { Router } from 'express'
import { z } from 'zod'
import { requireOwner } from '../middleware/requireOwner.js'
import { extractEventFromUrl } from '../services/extractEvent.js'
import { createEventWorkbook } from '../services/eventWorkbook.js'
import { eventSchema, prepareEventUpdate } from '../services/eventValidation.js'
import { recordUntitledImport } from '../services/failedImport.js'
import { emailConfiguration, fetchAllEvents, sendImmediateEventReport } from '../services/monthlyReports.js'
import { geminiConfiguration } from '../services/geminiResearch.js'
import { getSupabase } from '../services/supabase.js'
import { duplicateMessage, findDuplicateEvents } from '../services/duplicateDetection.js'
import { sendError } from '../utils/httpError.js'
import {
  LIST_COLUMNS,
  RECOVERY_PERIOD_MS,
  indiaDayFilter,
  indiaToday,
  listParams,
  splitRange,
} from '../services/adminListing.js'

export const adminRouter = Router()
adminRouter.use(requireOwner)
adminRouter.param('id', (request, response, next, id) => {
  if (!z.string().uuid().safeParse(id).success) {
    return response.status(400).json({ error: { message: 'Event ID must be a valid UUID.' } })
  }
  return next()
})

function duplicateConflict(response, duplicates) {
  return response.status(409).json({ error: { message: duplicateMessage(duplicates), code: 'duplicate_event', duplicates } })
}

adminRouter.post('/import', async (request, response) => {
  try {
    const schema = z.object({
      url: z.string().url().max(2048),
      update_existing: z.boolean().optional(),
      // Set after the administrator confirms that a flagged match is a different event.
      allow_duplicate: z.boolean().optional(),
    })
    const parsed = schema.safeParse(request.body)
    if (!parsed.success) return response.status(400).json({ error: { message: 'Enter a valid source URL.' } })

    const supabase = getSupabase()
    // Same source page (normalised URL), across drafts and published events.
    const sourceDuplicates = await findDuplicateEvents(supabase, { source_url: parsed.data.url })
    const duplicate = sourceDuplicates[0] || null
    if (duplicate && !parsed.data.update_existing && !parsed.data.allow_duplicate) {
      return response.json({ data: { duplicate, duplicates: sourceDuplicates, research: { status: 'skipped_duplicate' } } })
    }
    if (parsed.data.update_existing && !duplicate) {
      return response.status(404).json({ error: { message: 'No existing event uses this source URL.' } })
    }

    const result = await extractEventFromUrl(parsed.data.url)
    if (!result.fields.name?.trim()) {
      result.failed_import_saved = true
      result.missing_fields = await recordUntitledImport(supabase, {
        sourceUrl: parsed.data.url,
        ownerId: request.owner.id,
        extraction: result,
      })
    }
    // Same event under another URL: title, date, start time and organizer.
    let duplicates = sourceDuplicates
    try {
      duplicates = await findDuplicateEvents(supabase, { ...result.fields, source_url: parsed.data.url })
    } catch (error) {
      console.warn('Duplicate check after extraction failed:', error.message)
      result.warnings = [...(result.warnings || []), { field: 'duplicates', message: 'The duplicate check could not be completed. Search the event list before publishing.' }]
    }
    // `duplicate` keeps its original meaning (same source page, the record "update existing"
    // refreshes); `duplicates` lists every match, including the same event under another URL.
    return response.json({ data: { ...result, duplicate: duplicates.find(({ match }) => match === 'source_url') || null, duplicates } })
  } catch (error) {
    return sendError(response, error)
  }
})

const duplicateCheckSchema = z.object({
  name: z.string().max(240).nullable().optional(),
  start_date: z.string().date().nullable().optional().or(z.literal('')),
  start_time: z.string().max(16).nullable().optional(),
  organizer_name: z.string().max(500).nullable().optional(),
  source_url: z.string().max(2048).nullable().optional(),
  exclude_id: z.string().uuid().nullable().optional(),
})

adminRouter.post('/events/check-duplicates', async (request, response) => {
  try {
    const parsed = duplicateCheckSchema.safeParse(request.body)
    if (!parsed.success) return response.status(400).json({ error: { message: 'Provide an event name, date or source URL to check.' } })
    const { exclude_id: excludeId, ...candidate } = parsed.data
    const duplicates = await findDuplicateEvents(getSupabase(), candidate, { excludeId })
    return response.json({ data: { duplicates } })
  } catch (error) {
    return sendError(response, error)
  }
})

adminRouter.get('/dashboard', async (_request, response) => {
  try {
    const supabase = getSupabase()
    const today = new Date().toISOString().slice(0, 10)
    const [total, published, drafts, needsVerification, upcoming] = await Promise.all([
      supabase.from('events').select('id', { count: 'exact', head: true }).is('deleted_at', null),
      supabase.from('events').select('id', { count: 'exact', head: true }).eq('status', 'published').is('deleted_at', null),
      supabase.from('events').select('id', { count: 'exact', head: true }).eq('status', 'draft').is('deleted_at', null),
      supabase.from('events').select('id', { count: 'exact', head: true }).neq('verification_status', 'verified').is('deleted_at', null),
      supabase.from('events').select('start_date').eq('status', 'published').is('deleted_at', null).gte('start_date', today),
    ])
    for (const result of [total, published, drafts, needsVerification, upcoming]) {
      if (result.error) throw result.error
    }
    const upcomingWeekend = (upcoming.data || []).filter((event) => {
      const day = new Date(`${event.start_date}T12:00:00Z`).getUTCDay()
      return day === 0 || day === 6
    }).length
    return response.json({ data: {
      total: total.count || 0,
      published: published.count || 0,
      drafts: drafts.count || 0,
      needs_verification: needsVerification.count || 0,
      upcoming_weekend: upcomingWeekend,
    } })
  } catch (error) {
    return sendError(response, error)
  }
})

adminRouter.get('/events', async (request, response) => {
  try {
    const params = listParams(request.query)
    if (params.error) return response.status(400).json({ error: { message: params.error } })
    const { page, pageSize, status, search, sort, direction, date } = params
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1
    const supabase = getSupabase()
    const base = (columns, options) => {
      let query = supabase.from('events').select(columns, options).is('deleted_at', null)
      if (status) query = query.eq('status', status)
      if (search) query = query.ilike('name', `%${search}%`)
      if (date) query = query.or(indiaDayFilter(date))
      return query
    }

    // With a single-day filter there is nothing to split into upcoming/past, so the
    // plain ordering below applies (by time of day for the date sort).
    if (sort === 'date' && direction === 'asc' && !date) {
      // "Upcoming first": events from today (IST) onwards, soonest first; then past
      // events, most recent first; then events without a date. Paged across both groups.
      const today = indiaToday()
      const upcoming = () => base(LIST_COLUMNS).gte('start_date', today)
      const past = () => base(LIST_COLUMNS).or(`start_date.lt.${today},start_date.is.null`)
      const [upcomingCount, pastCount] = await Promise.all([
        base('id', { count: 'exact', head: true }).gte('start_date', today),
        base('id', { count: 'exact', head: true }).or(`start_date.lt.${today},start_date.is.null`),
      ])
      for (const result of [upcomingCount, pastCount]) if (result.error) throw result.error
      const ranges = splitRange(from, to, upcomingCount.count || 0)
      const [upcomingRows, pastRows] = await Promise.all([
        ranges.upcoming
          ? upcoming().order('start_date', { ascending: true }).order('start_time', { ascending: true, nullsFirst: false }).order('id').range(...ranges.upcoming)
          : { data: [] },
        ranges.past
          ? past().order('start_date', { ascending: false, nullsFirst: false }).order('start_time', { ascending: false, nullsFirst: false }).order('id').range(...ranges.past)
          : { data: [] },
      ])
      for (const result of [upcomingRows, pastRows]) if (result.error) throw result.error
      const total = (upcomingCount.count || 0) + (pastCount.count || 0)
      return response.json({ data: { events: [...(upcomingRows.data || []), ...(pastRows.data || [])], total, page, page_size: pageSize } })
    }

    const sortColumns = { updated: 'updated_at', date: 'start_date', name: 'name' }
    let listQuery = base(LIST_COLUMNS, { count: 'exact' })
      .order(sortColumns[sort], { ascending: direction === 'asc', nullsFirst: false })
    if (sort === 'date') listQuery = listQuery.order('start_time', { ascending: direction === 'asc', nullsFirst: false })
    const { data, error, count } = await listQuery.order('id').range(from, to)
    if (error) throw error
    return response.json({ data: { events: data || [], total: count || 0, page, page_size: pageSize } })
  } catch (error) {
    return sendError(response, error)
  }
})

adminRouter.get('/events/deleted', async (request, response) => {
  try {
    const params = listParams(request.query)
    if (params.error) return response.status(400).json({ error: { message: params.error } })
    const { page, pageSize, search } = params
    const from = (page - 1) * pageSize
    const cutoff = new Date(Date.now() - RECOVERY_PERIOD_MS).toISOString()
    let query = getSupabase().from('events').select(LIST_COLUMNS, { count: 'exact' })
      .not('deleted_at', 'is', null)
      .gte('deleted_at', cutoff)
    if (search) query = query.ilike('name', `%${search}%`)
    const { data, error, count } = await query.order('deleted_at', { ascending: false }).order('id').range(from, from + pageSize - 1)
    if (error) throw error
    return response.json({ data: { events: data || [], total: count || 0, page, page_size: pageSize } })
  } catch (error) {
    return sendError(response, error)
  }
})

adminRouter.get('/events/:id', async (request, response) => {
  try {
    const { data, error } = await getSupabase().from('events').select('*').eq('id', request.params.id).is('deleted_at', null).maybeSingle()
    if (error) throw error
    if (!data) return response.status(404).json({ error: { message: 'Event not found.' } })
    return response.json({ data })
  } catch (error) {
    return sendError(response, error)
  }
})

adminRouter.post('/events', async (request, response) => {
  try {
    const parsed = eventSchema.safeParse(request.body)
    if (!parsed.success) return response.status(400).json({ error: { message: `Review the event fields: ${parsed.error.issues.map(({ path, message }) => `${path.join('.')}: ${message}`).join('; ')}` } })
    const fields = { ...parsed.data, status: 'draft', created_by: request.owner.id }
    if (!fields.timezone && fields.extraction_status !== 'extracted') fields.timezone = 'Asia/Kolkata'
    if (fields.start_date && fields.start_time && fields.timezone) delete fields.start_at
    if (fields.end_date && fields.end_time && fields.timezone) delete fields.end_at
    const prepared = prepareEventUpdate({}, fields)
    if (prepared.error) return response.status(422).json({ error: { message: prepared.error } })
    Object.assign(fields, prepared.updates)
    const supabase = getSupabase()
    // Never create a second copy silently; the administrator can confirm and retry.
    if (request.body?.allow_duplicate !== true) {
      const duplicates = await findDuplicateEvents(supabase, fields)
      if (duplicates.length) return duplicateConflict(response, duplicates)
    }
    const { data, error } = await supabase.from('events').insert(fields).select().single()
    if (error) throw error
    return response.status(201).json({ data })
  } catch (error) {
    return sendError(response, error)
  }
})

adminRouter.patch('/events/:id', async (request, response) => {
  try {
    const parsed = eventSchema.partial().safeParse(request.body)
    if (!parsed.success) return response.status(400).json({ error: { message: `Review the event fields: ${parsed.error.issues.map(({ path, message }) => `${path.join('.')}: ${message}`).join('; ')}` } })
    const updates = { ...parsed.data }
    delete updates.status
    if (!Object.keys(updates).length) return response.status(400).json({ error: { message: 'Provide at least one event field to update.' } })
    const supabase = getSupabase()
    const { data: current, error: readError } = await supabase.from('events').select('*')
      .eq('id', request.params.id).is('deleted_at', null).maybeSingle()
    if (readError) throw readError
    if (!current) return response.status(404).json({ error: { message: 'Event not found.' } })
    const prepared = prepareEventUpdate(current, updates)
    if (prepared.error) return response.status(422).json({ error: { message: prepared.error } })
    const { data, error } = await supabase
      .from('events')
      .update({ ...prepared.updates, updated_at: new Date().toISOString() })
      .eq('id', request.params.id)
      .is('deleted_at', null)
      .select()
      .maybeSingle()
    if (error) throw error
    if (!data) return response.status(404).json({ error: { message: 'Event not found.' } })
    return response.json({ data })
  } catch (error) {
    return sendError(response, error)
  }
})

async function setEventStatus(request, response, status) {
  try {
    const { data: event, error: readError } = await getSupabase()
      .from('events').select('*').eq('id', request.params.id).is('deleted_at', null).maybeSingle()
    if (readError) throw readError
    if (!event) return response.status(404).json({ error: { message: 'Event not found.' } })
    const validation = prepareEventUpdate(event, { status })
    if (validation.error) return response.status(422).json({ error: { message: validation.error } })
    // Publishing a second live copy of an event needs explicit confirmation.
    if (status === 'published' && event.status !== 'published' && request.body?.allow_duplicate !== true) {
      const duplicates = await findDuplicateEvents(getSupabase(), event, { excludeId: event.id, statuses: ['published'] })
      if (duplicates.length) return duplicateConflict(response, duplicates)
    }
    const { data, error } = await getSupabase().from('events')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', request.params.id).is('deleted_at', null).select().single()
    if (error) throw error
    return response.json({ data })
  } catch (error) {
    return sendError(response, error)
  }
}

adminRouter.post('/events/:id/publish', (request, response) => setEventStatus(request, response, 'published'))
adminRouter.post('/events/:id/unpublish', (request, response) => setEventStatus(request, response, 'draft'))

adminRouter.delete('/events/:id', async (request, response) => {
  try {
    // The RPC only deletes an active event (atomically), so call it first and
    // read the row only to explain why nothing was deleted.
    const supabase = getSupabase()
    const { data, error } = await supabase.rpc('soft_delete_event', {
      p_event_id: request.params.id,
      p_actor_id: request.owner.id,
      p_now: new Date().toISOString(),
    })
    if (error) throw error
    const event = Array.isArray(data) ? data[0] : data
    if (event) return response.json({ data: event })
    const { data: current, error: readError } = await supabase.from('events')
      .select('id,deleted_at').eq('id', request.params.id).maybeSingle()
    if (readError) throw readError
    if (!current) return response.status(404).json({ error: { message: 'Event not found.' } })
    if (current.deleted_at) return response.status(409).json({ error: { message: 'This event is already in Recently Deleted.' } })
    return response.status(409).json({ error: { message: 'The event changed before it could be deleted. Refresh the list and try again.' } })
  } catch (error) {
    return sendError(response, error)
  }
})

adminRouter.post('/events/:id/restore', async (request, response) => {
  try {
    // The RPC only restores a deleted event inside the recovery window (atomically),
    // so call it first and read the row only to explain a refusal.
    const supabase = getSupabase()
    const { data, error } = await supabase.rpc('restore_event', {
      p_event_id: request.params.id,
      p_actor_id: request.owner.id,
      p_now: new Date().toISOString(),
    })
    if (error) throw error
    const event = Array.isArray(data) ? data[0] : data
    if (event) return response.json({ data: event })
    const { data: current, error: readError } = await supabase.from('events')
      .select('id,deleted_at').eq('id', request.params.id).maybeSingle()
    if (readError) throw readError
    if (!current) return response.status(404).json({ error: { message: 'Event not found.' } })
    if (!current.deleted_at) return response.status(409).json({ error: { message: 'This event is already active.' } })
    return response.status(410).json({ error: { message: 'The 30-day recovery period has expired.' } })
  } catch (error) {
    return sendError(response, error)
  }
})

adminRouter.delete('/events/:id/permanent', async (request, response) => {
  try {
    const { data, error } = await getSupabase().rpc('permanently_delete_event', {
      p_event_id: request.params.id,
      p_actor_id: request.owner.id,
      p_now: new Date().toISOString(),
    })
    if (error) throw error
    if (!data) return response.status(409).json({ error: { message: 'Only an event in Recently Deleted can be permanently deleted.' } })
    return response.json({ data: { deleted: true } })
  } catch (error) {
    return sendError(response, error)
  }
})

adminRouter.get('/export/events.xlsx', async (_request, response) => {
  try {
    const events = await fetchAllEvents(getSupabase())
    const workbook = await createEventWorkbook(events)
    const filename = `the-orbit-events-${new Date().toISOString().slice(0, 10)}.xlsx`
    response.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    response.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    response.setHeader('Cache-Control', 'private, no-store')
    return response.send(workbook)
  } catch (error) {
    return sendError(response, error)
  }
})

adminRouter.get('/settings/integrations', async (_request, response) => {
  try {
    const supabase = getSupabase()
    const [schedule, recent] = await Promise.all([
      supabase.from('monthly_report_schedule').select('next_period').eq('singleton', true).maybeSingle(),
      supabase.from('report_deliveries').select('report_period,status,attempt_count,delivered_at,last_error,updated_at')
        .order('created_at', { ascending: false }).limit(1),
    ])
    if (schedule.error) throw schedule.error
    if (recent.error) throw recent.error
    const email = (() => {
      try { return emailConfiguration() } catch { return null }
    })()
    const gemini = geminiConfiguration()
    return response.json({ data: {
      email_configured: Boolean(email),
      report_recipient: email?.recipient || null,
      next_report_period: schedule.data?.next_period || null,
      latest_report: recent.data?.[0] || null,
      gemini_configured: gemini.configured,
      gemini_model: gemini.configured ? gemini.model : null,
      search_grounding_enabled: gemini.searchGrounding,
    } })
  } catch (error) {
    return sendError(response, error)
  }
})

adminRouter.post('/reports/send', async (_request, response) => {
  try {
    const data = await sendImmediateEventReport({ supabase: getSupabase() })
    return response.json({ data })
  } catch (error) {
    return sendError(response, error)
  }
})
