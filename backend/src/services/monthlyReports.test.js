import assert from 'node:assert/strict'
import test from 'node:test'
import {
  deliverEventWorkbook,
  emailConfiguration,
  fetchAllEvents,
  getClosedReportPeriod,
} from './monthlyReports.js'

const emailEnv = {
  SMTP_HOST: 'smtp.test.invalid',
  SMTP_PORT: '587',
  SMTP_USER: 'test-user',
  SMTP_PASS: 'test-pass',
  EMAIL_FROM: 'reports@example.invalid',
  REPORT_RECIPIENT_EMAIL: 'owner@example.invalid',
}

test('report period uses the Asia/Kolkata calendar month and the previous closed month', () => {
  assert.equal(getClosedReportPeriod(new Date('2026-10-16T03:22:00.000Z')), '2026-09')
  assert.equal(getClosedReportPeriod(new Date('2026-03-31T20:00:00.000Z')), '2026-03')
})

test('SMTP configuration requires the selected provider fields', () => {
  assert.throws(() => emailConfiguration({}), /SMTP_HOST.*SMTP_PORT.*SMTP_USER.*SMTP_PASS.*EMAIL_FROM.*REPORT_RECIPIENT_EMAIL/)
  assert.equal(emailConfiguration(emailEnv).secure, false)
  assert.equal(emailConfiguration({ ...emailEnv, SMTP_PORT: '465' }).secure, true)
})

test('event workbook email is claimed once and includes a generated XLSX attachment', async () => {
  const state = { attempt: 0, delivered: false, mail: null, finishes: [] }
  const supabase = {
    rpc: async (name, parameters) => {
      if (name === 'claim_report_delivery') {
        state.attempt += 1
        if (state.delivered || state.attempt > 1) return { data: [], error: null }
        return { data: [{ attempt_count: 1, report_id: parameters.p_report_id }], error: null }
      }
      state.finishes.push(parameters)
      state.delivered = parameters.p_success
      return { data: null, error: null }
    },
    from: () => ({
      select: () => ({
        order: () => ({
          range: async () => ({ data: [{
            id: 'report-event', name: 'Report event', status: 'published', deleted_at: null,
          }], error: null }),
        }),
      }),
    }),
  }
  const transporter = { sendMail: async (message) => { state.mail = message } }
  const options = {
    supabase,
    reportId: 'monthly:2026-09',
    period: '2026-09',
    type: 'monthly',
    now: new Date('2026-10-01T04:30:00.000Z'),
    env: emailEnv,
    transporter,
    workbookFactory: async () => Buffer.from('test workbook'),
  }

  const result = await deliverEventWorkbook(options)
  assert.equal(result.delivered, true)
  assert.equal(result.counts.total, 1)
  assert.equal(state.mail.subject, 'The Orbit event report · 2026-09')
  assert.equal(state.mail.attachments[0].filename, 'the-orbit-events-2026-09.xlsx')
  assert.equal(state.mail.attachments[0].content.toString(), 'test workbook')
  assert.equal(state.finishes[0].p_success, true)

  const second = await deliverEventWorkbook(options)
  assert.equal(second.skipped, true)
  assert.equal(state.mail.attachments.length, 1)
})

test('failed report email records a retryable delivery failure', async () => {
  const state = { failure: null }
  const supabase = {
    rpc: async (name, parameters) => {
      if (name === 'claim_report_delivery') return { data: [{ attempt_count: 2 }], error: null }
      state.failure = parameters
      return { data: null, error: null }
    },
    from: () => ({
      select: () => ({
        order: () => ({
          range: async () => ({ data: [], error: null }),
        }),
      }),
    }),
  }

  await assert.rejects(deliverEventWorkbook({
    supabase,
    reportId: 'monthly:2026-09',
    period: '2026-09',
    type: 'monthly',
    now: new Date('2026-10-01T04:30:00.000Z'),
    env: emailEnv,
    transporter: { sendMail: async () => { throw new Error('Temporary SMTP connection failure') } },
    workbookFactory: async () => Buffer.from('test workbook'),
  }), /Temporary SMTP connection failure/)
  assert.equal(state.failure.p_success, false)
  assert.equal(state.failure.p_retry_seconds, 120)
  assert.match(state.failure.p_error, /Temporary SMTP/)
})

test('event export pagination reads all event rows rather than relying on the frontend', async () => {
  let ranges = 0
  const supabase = {
    from: () => ({
      select: () => ({
        order: () => ({
          range: async (from, to) => {
            ranges += 1
            assert.equal(to - from + 1, 500)
            return { data: from === 0 ? Array.from({ length: 500 }, (_value, index) => ({ id: index })) : [{ id: 500 }], error: null }
          },
        }),
      }),
    }),
  }
  const rows = await fetchAllEvents(supabase)
  assert.equal(rows.length, 501)
  assert.equal(ranges, 2)
})
