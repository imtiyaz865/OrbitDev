import 'dotenv/config'
import { getSupabase } from '../services/supabase.js'
import { purgeExpiredEvents } from '../services/eventRetention.js'
import { processNextMonthlyReport } from '../services/monthlyReports.js'

async function run() {
  const supabase = getSupabase()
  let failed = false

  try {
    await purgeExpiredEvents(supabase)
  } catch (error) {
    failed = true
    console.error('Expired event cleanup failed.', error.message)
  }

  try {
    const report = await processNextMonthlyReport({ supabase })
    if (report.skipped) console.info('No monthly report is due.', { period: report.period || null })
  } catch (error) {
    failed = true
    console.error('Scheduled monthly report failed and will be retried.', error.message)
  }

  if (failed) process.exitCode = 1
}

run().catch((error) => {
  console.error('Scheduled backend tasks could not start.', error.message)
  process.exitCode = 1
})
