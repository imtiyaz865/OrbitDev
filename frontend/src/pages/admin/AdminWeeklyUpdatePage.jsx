import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, Clipboard, Download, LoaderCircle, RefreshCw } from 'lucide-react'
import { adminApi } from '../../services/adminApi.js'
import { formatEventTimeInIndia, formatIndiaDate } from '../../utils/times.js'
import { createWeeklyUpdate, defaultIndiaWeekend, weeklyUpdateCsv, weeklyUpdateText } from '../../utils/weeklyUpdate.js'

const pageSize = 100

async function loadPublishedEvents() {
  const events = []
  let page = 1
  let total = 0
  do {
    const result = await adminApi.getEvents({ status: 'published', page, page_size: pageSize, sort: 'date', direction: 'asc' })
    events.push(...(result.events || []))
    total = result.total || 0
    page += 1
  } while (events.length < total)
  return events
}

function EventRow({ item, index }) {
  const { event, date, time, endTime, venue, missing } = item
  return (
    <li className="weekly-event">
      <span className="weekly-event-number">{String(index + 1).padStart(2, '0')}</span>
      <div className="weekly-event-copy">
        <strong>{event.name || 'Event name not confirmed'}</strong>
        <span>{date ? formatIndiaDate(date, { weekday: 'long', day: 'numeric', month: 'long' }) : 'Date not confirmed'}</span>
        <span>{time ? `${formatEventTimeInIndia(event)}${endTime ? ` – ${formatEventTimeInIndia(event, 'end')}` : ''}` : 'Time not confirmed'}</span>
        <span>{venue}</span>
      </div>
      {missing.length > 0 && <span className="weekly-event-review">Needs {missing.join(' + ')}</span>}
    </li>
  )
}

export function AdminWeeklyUpdatePage() {
  const [range, setRange] = useState(defaultIndiaWeekend)
  const [includePast, setIncludePast] = useState(false)
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState('')

  const refresh = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setEvents(await loadPublishedEvents())
    } catch (err) {
      setError(err.message || 'Published events could not be loaded.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const update = useMemo(() => {
    try {
      return createWeeklyUpdate(events, {
        startDate: range.start,
        endDate: range.end,
        includePast,
      })
    } catch {
      return null
    }
  }, [events, range.start, range.end, includePast])

  const text = update ? weeklyUpdateText(update) : ''

  async function copyUpdate() {
    setCopied(false)
    setCopyError('')
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard access is unavailable in this browser.')
      await navigator.clipboard.writeText(text)
      setCopied(true)
    } catch (err) {
      setCopyError(err.message || 'The update could not be copied.')
    }
  }

  function downloadCsv() {
    if (!update) return
    const blob = new Blob([weeklyUpdateCsv(update)], { type: 'text/csv;charset=utf-8' })
    const href = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = href
    link.download = `orbit-weekly-update-${range.start}-to-${range.end}.csv`
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(href), 1000)
  }

  return (
    <section className="admin-page weekly-update-page">
      <div className="admin-page-heading weekly-update-heading">
        <div>
          <span className="admin-eyebrow">WHATSAPP PREPARATION</span>
          <h1>Weekly event update</h1>
          <p>Prepare a clean list from published events for your weekend poster.</p>
        </div>
        <button className="admin-secondary-button" type="button" onClick={refresh} disabled={loading}>
          {loading ? <LoaderCircle className="spin" size={15} /> : <RefreshCw size={15} />}
          {loading ? 'Loading events…' : 'Refresh events'}
        </button>
      </div>

      <section className="weekly-update-controls" aria-label="Update date range">
        <label className="admin-field">From<input type="date" value={range.start} onChange={(event) => setRange((current) => ({ ...current, start: event.target.value }))} /></label>
        <label className="admin-field">To<input type="date" value={range.end} onChange={(event) => setRange((current) => ({ ...current, end: event.target.value }))} /></label>
        <label className="weekly-include-past"><input type="checkbox" checked={includePast} onChange={(event) => setIncludePast(event.target.checked)} /> Include past events</label>
      </section>

      {error && <div className="admin-alert" role="alert">{error}</div>}
      {range.start && range.end && range.start > range.end && <div className="admin-alert" role="alert">The end date must be on or after the start date.</div>}
      {copyError && <div className="admin-alert" role="alert">{copyError}</div>}

      <section className="weekly-update-output" aria-labelledby="weekly-update-title">
        <div className="weekly-update-output-heading">
          <div>
            <span className="admin-eyebrow">COPY-READY LIST</span>
            <h2 id="weekly-update-title">{update?.title || 'Choose a date range'}</h2>
            <p>{loading ? 'Loading published events…' : `${update?.events.length || 0} events${update?.dateNeedsReview.length ? ` · ${update.dateNeedsReview.length} need a date review` : ''}`}</p>
          </div>
          <div className="weekly-update-actions">
            <button className="admin-secondary-button" type="button" onClick={downloadCsv} disabled={!update || loading}><Download size={15} /> CSV</button>
            <button className="admin-primary-button" type="button" onClick={copyUpdate} disabled={!update || loading}>{copied ? <Check size={15} /> : <Clipboard size={15} />}{copied ? 'Copied' : 'Copy weekly update'}</button>
          </div>
        </div>

        {loading
          ? <div className="admin-empty"><LoaderCircle className="spin" size={20} /><span>Loading events from your library…</span></div>
          : update?.events.length || update?.dateNeedsReview.length
            ? <ol className="weekly-event-list">
              {update.events.map((item, index) => <EventRow key={item.event.id} item={item} index={index} />)}
              {update.dateNeedsReview.length > 0 && <li className="weekly-review-heading">Published events missing a usable date</li>}
              {update.dateNeedsReview.map((item, index) => <EventRow key={item.event.id} item={item} index={update.events.length + index} />)}
            </ol>
            : <div className="admin-empty"><span>No published events match this date range.</span></div>}

        {update && <details className="weekly-text-details">
          <summary>Preview copyable text</summary>
          <pre>{text}</pre>
        </details>}
      </section>
      <p className="weekly-update-footnote">Times and weekend dates are shown in Asia/Kolkata. Only published, non-cancelled events are listed; incomplete details stay visible for review.</p>
    </section>
  )
}
