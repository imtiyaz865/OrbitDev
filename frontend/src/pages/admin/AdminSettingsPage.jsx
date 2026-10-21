import { useEffect, useState } from 'react'
import { Download, LoaderCircle, Mail } from 'lucide-react'
import { adminApi } from '../../services/adminApi.js'

export function AdminSettingsPage() {
  const [integrations, setIntegrations] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState('')

  useEffect(() => {
    let active = true
    adminApi.getIntegrationSettings()
      .then((result) => { if (active) setIntegrations(result) })
      .catch((err) => { if (active) setError(err.message) })
    return () => { active = false }
  }, [])

  async function exportEvents() {
    setBusy('export')
    setError('')
    setNotice('')
    try {
      const { blob, filename } = await adminApi.exportEvents()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      link.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      setNotice('Workbook downloaded.')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  async function sendReport() {
    setBusy('email')
    setError('')
    setNotice('')
    try {
      const result = await adminApi.emailEventReport()
      setNotice(`Report emailed successfully · ${result.counts.total} events included.`)
      const refreshed = await adminApi.getIntegrationSettings()
      setIntegrations(refreshed)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="admin-page admin-settings-page">
      <div className="admin-page-heading">
        <div><h1>Settings</h1></div>
      </div>
      {error && <div className="admin-alert" role="alert">{error}</div>}
      {notice && <div className="admin-success-message" role="status">{notice}</div>}
      <section className="settings-section settings-report-section" aria-labelledby="data-heading">
        <div><h2 id="data-heading">Event data</h2><p>Export the complete event archive, including drafts and recently deleted records.</p></div>
        <button className="admin-primary-button" type="button" onClick={exportEvents} disabled={Boolean(busy)}>
          {busy === 'export' ? <LoaderCircle className="spin" size={15} /> : <Download size={15} />}
          {busy === 'export' ? 'Preparing workbook…' : 'Export Data'}
        </button>
      </section>
      <section className="settings-section settings-report-section" aria-labelledby="report-heading">
        <div>
          <h2 id="report-heading">Monthly email report</h2>
          {integrations ? <>
            <p>{integrations.email_configured ? `Sending to ${integrations.report_recipient}` : 'SMTP email is not configured on the backend.'}</p>
            <p>{integrations.latest_report
              ? `Latest: ${integrations.latest_report.report_period} · ${integrations.latest_report.status}${integrations.latest_report.attempt_count ? ` · ${integrations.latest_report.attempt_count} attempt(s)` : ''}`
              : `Next scheduled report: ${integrations.next_report_period || 'Awaiting database migration'}`}</p>
          </> : <p>Checking report configuration…</p>}
        </div>
        <button className="admin-secondary-button" type="button" onClick={sendReport} disabled={Boolean(busy) || !integrations?.email_configured}>
          {busy === 'email' ? <LoaderCircle className="spin" size={15} /> : <Mail size={15} />}
          {busy === 'email' ? 'Sending report…' : 'Email report now'}
        </button>
      </section>
      <section className="settings-section settings-report-section" aria-labelledby="gemini-heading">
        <div>
          <h2 id="gemini-heading">Event research</h2>
          <p>{integrations?.gemini_configured
            ? `${integrations.gemini_model}${integrations.search_grounding_enabled ? ' · Google Search grounding enabled' : ' · Search grounding disabled'}`
            : 'Gemini is not configured; URL imports use public page metadata only.'}</p>
        </div>
        <span className={`integration-status${integrations?.gemini_configured ? ' is-ready' : ''}`}>{integrations?.gemini_configured ? 'Configured' : 'Not configured'}</span>
      </section>
    </div>
  )
}
