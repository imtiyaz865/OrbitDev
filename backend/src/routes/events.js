import { Router } from 'express'
import { z } from 'zod'
import { getSupabase } from '../services/supabase.js'
import { sendError } from '../utils/httpError.js'

export const eventsRouter = Router()

const datePattern = /^\d{4}-\d{2}-\d{2}$/
const rangeSchema = z.object({
  start: z.string().regex(datePattern),
  end: z.string().regex(datePattern),
})

function isSaturdayToSunday(start, end) {
  const startDate = new Date(`${start}T12:00:00Z`)
  const endDate = new Date(`${end}T12:00:00Z`)
  return !Number.isNaN(startDate.getTime())
    && !Number.isNaN(endDate.getTime())
    && startDate.getUTCDay() === 6
    && endDate.getUTCDay() === 0
    && endDate.getTime() - startDate.getTime() === 86_400_000
}

eventsRouter.get('/weekends', async (request, response) => {
  try {
    const range = rangeSchema.safeParse(request.query)
    if (!range.success || !isSaturdayToSunday(range.data.start, range.data.end)) {
      return response.status(400).json({ error: { message: 'Provide a Saturday start date and the following Sunday.' } })
    }
    const { data, error } = await getSupabase()
      .from('events')
      .select('id,slug,name,event_type,start_at,end_at,start_date,start_time,end_time,timezone,organizer_name,banner_url,registration_status')
      .eq('status', 'published')
      .is('deleted_at', null)
      .gte('start_date', range.data.start)
      .lte('start_date', range.data.end)
      .order('start_date')
      .order('start_time', { nullsFirst: false })
    if (error) throw error
    return response.json({ data: data || [] })
  } catch (error) {
    return sendError(response, error)
  }
})

eventsRouter.get('/:slug', async (request, response) => {
  try {
    const { data, error } = await getSupabase()
      .from('events')
      .select('id,slug,name,description,event_type,tags,start_at,end_at,start_date,start_time,end_time,timezone,attendance_mode,venue_name,address,city,online_details,organizer_name,organizer_website,organizer_logo_url,speakers,agenda_items,sponsors,registration_url,registration_fee_type,registration_amount,registration_currency,registration_deadline,registration_status,banner_url,source_url')
      .eq('slug', request.params.slug)
      .eq('status', 'published')
      .is('deleted_at', null)
      .maybeSingle()
    if (error) throw error
    if (!data) return response.status(404).json({ error: { message: 'Event not found.' } })
    return response.json({ data })
  } catch (error) {
    return sendError(response, error)
  }
})
