import { randomUUID } from 'node:crypto'
import nodemailer from 'nodemailer'
import { createEventWorkbook } from './eventWorkbook.js'

const pageSize = 500

export function getClosedReportPeriod(date = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(date).map(({ type, value }) => [type, value]))
  const previous = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 2, 1))
  return `${previous.getUTCFullYear()}-${String(previous.getUTCMonth() + 1).padStart(2, '0')}`
}

export async function fetchAllEvents(supabase) {
  const events = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase.from('events')
      .select('*')
      .order('created_at', { ascending: true })
      .range(from, from + pageSize - 1)
    if (error) throw error
    events.push(...(data || []))
    if (!data || data.length < pageSize) return events
  }
}

function emailConfiguration(env = process.env) {
  const port = Number(env.SMTP_PORT)
  const missing = [
    !env.SMTP_HOST && 'SMTP_HOST',
    !Number.isInteger(port) || port < 1 || port > 65535 ? 'SMTP_PORT' : null,
    !env.SMTP_USER && 'SMTP_USER',
    !env.SMTP_PASS && 'SMTP_PASS',
    !env.EMAIL_FROM && 'EMAIL_FROM',
    !env.REPORT_RECIPIENT_EMAIL && 'REPORT_RECIPIENT_EMAIL',
  ].filter(Boolean)
  if (missing.length) throw new Error(`Email reporting is not configured. Set ${missing.join(', ')}.`)
  return {
    host: env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    from: env.EMAIL_FROM,
    recipient: env.REPORT_RECIPIENT_EMAIL,
  }
}

function createTransport(configuration) {
  return nodemailer.createTransport({
    host: configuration.host,
    port: configuration.port,
    secure: configuration.secure,
    auth: configuration.auth,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  })
}

function reportCounts(events) {
  return {
    total: events.length,
    published: events.filter((event) => event.status === 'published').length,
    drafts: events.filter((event) => event.status === 'draft').length,
    recently_deleted: events.filter((event) => event.deleted_at).length,
  }
}

async function claimDelivery(supabase, { reportId, period, type, now }) {
  const { data, error } = await supabase.rpc('claim_report_delivery', {
    p_report_id: reportId,
    p_report_period: period,
    p_report_type: type,
    p_now: now.toISOString(),
  })
  if (error) throw error
  return Array.isArray(data) ? data[0] || null : data || null
}

async function finishDelivery(supabase, reportId, success, error, attemptCount, now) {
  const retrySeconds = Math.min(86_400, 60 * (2 ** Math.min(Math.max(attemptCount - 1, 0), 10)))
  const { error: finishError } = await supabase.rpc('finish_report_delivery', {
    p_report_id: reportId,
    p_success: success,
    p_error: error ? String(error.message || 'Report email failed.') : null,
    p_retry_seconds: retrySeconds,
    p_now: now.toISOString(),
  })
  if (finishError) throw finishError
}

export async function deliverEventWorkbook({
  supabase,
  reportId,
  period,
  type,
  now = new Date(),
  env = process.env,
  transporter,
  workbookFactory = createEventWorkbook,
}) {
  const claimed = await claimDelivery(supabase, { reportId, period, type, now })
  if (!claimed) return { delivered: false, skipped: true }
  let deliveryError
  try {
    const configuration = emailConfiguration(env)
    const events = await fetchAllEvents(supabase)
    const workbook = await workbookFactory(events, { generatedAt: now })
    const counts = reportCounts(events)
    const filename = type === 'monthly'
      ? `the-orbit-events-${period}.xlsx`
      : `the-orbit-events-${now.toISOString().slice(0, 10)}.xlsx`
    const summary = `Period: ${period}\nEvents in workbook: ${counts.total}\nPublished: ${counts.published}\nDrafts: ${counts.drafts}\nRecently deleted: ${counts.recently_deleted}\nGenerated: ${now.toISOString()}`
    const mailer = transporter || createTransport(configuration)
    await mailer.sendMail({
      from: configuration.from,
      to: configuration.recipient,
      subject: type === 'monthly' ? `The Orbit event report · ${period}` : `The Orbit event data · ${period}`,
      text: `Your requested The Orbit event workbook is attached.\n\n${summary}`,
      attachments: [{ filename, content: workbook, contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }],
    })
    await finishDelivery(supabase, reportId, true, null, claimed.attempt_count, now)
    console.info('Event workbook delivered.', { reportId, period, counts })
    return { delivered: true, period, counts, filename }
  } catch (error) {
    deliveryError = error
    try {
      await finishDelivery(supabase, reportId, false, error, claimed.attempt_count, now)
    } catch (recordError) {
      console.error('Could not persist report delivery failure.', { reportId, error: recordError.message })
      throw new Error('Report email failed and its retry state could not be recorded.')
    }
    console.error('Event workbook delivery failed.', { reportId, period, error: error.message })
  }
  throw new Error(deliveryError.message || 'Report email delivery failed.')
}

export async function sendImmediateEventReport({ supabase, now = new Date(), ...options }) {
  return deliverEventWorkbook({
    ...options,
    supabase,
    reportId: `manual:${randomUUID()}`,
    period: `on-demand ${now.toISOString().slice(0, 10)}`,
    type: 'manual',
    now,
  })
}

export async function processNextMonthlyReport({ supabase, now = new Date(), ...options }) {
  const { data, error } = await supabase.from('monthly_report_schedule')
    .select('next_period')
    .eq('singleton', true)
    .maybeSingle()
  if (error) throw error
  if (!data?.next_period) throw new Error('Monthly report schedule is missing; apply the reporting migration.')

  const period = String(data.next_period).slice(0, 7)
  if (period > getClosedReportPeriod(now)) return { delivered: false, skipped: true, period }
  return deliverEventWorkbook({
    ...options,
    supabase,
    reportId: `monthly:${period}`,
    period,
    type: 'monthly',
    now,
  })
}

export { emailConfiguration, reportCounts }
