import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowRight, ArrowUpRight, Check, LoaderCircle, Plus, Ticket } from 'lucide-react'
import { Link } from 'react-router-dom'
import { TimeField } from '../../components/TimeField.jsx'
import { adminApi } from '../../services/adminApi.js'
import { runSingleSubmission } from '../../utils/singleSubmission.js'
import { zonedDateTimeToIso } from '../../utils/weekends.js'
import { INDIA_TIME_ZONE } from '../../utils/times.js'

const stages = [
  ['fetching', 'Fetching event page'],
  ['extracting', 'Extracting event details'],
  ['researching', 'Researching missing details'],
  ['validating', 'Checking required details'],
  ['publishing', 'Publishing event'],
]

function slugify(value) {
  return value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const parsed = new Date(Date.UTC(year, month - 1, day))
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day
}

function eventPayload(fields, extraction, sourceUrl) {
  const name = fields.name?.trim() || ''
  const startDate = fields.start_date || null
  const startTime = fields.start_time || null
  const timezone = fields.timezone || INDIA_TIME_ZONE
  const startAt = startDate && startTime && timezone
    ? zonedDateTimeToIso(startDate, startTime, timezone)
    : fields.start_at || null
  const endDate = fields.end_date || null
  const endTime = fields.end_time || null
  const endAt = endDate && endTime && timezone
    ? zonedDateTimeToIso(endDate, endTime, timezone)
    : fields.end_at || null
  const extractedProvenance = Object.fromEntries(
    Object.entries(fields)
      .filter(([, value]) => value != null && value !== '' && (!Array.isArray(value) || value.length > 0))
      .map(([key]) => [key, 'extracted']),
  )
  const provenance = { ...extractedProvenance, ...(fields.field_provenance || {}) }
  for (const [key, value] of Object.entries(extraction.field_provenance || {})) provenance[key] = value
  for (const key of ['name', 'start_date', 'start_time', 'end_date', 'end_time', 'timezone']) {
    if (fields[key] !== extraction.fields?.[key] && fields[key]) provenance[key] = 'manual'
  }
  const unresolved = new Set(extraction.missing_fields || [])
  const remainingWarnings = (extraction.warnings || []).filter((warning) => {
    if (['start_date', 'start_time', 'end_date', 'end_time', 'timezone'].includes(warning.field)) {
      return unresolved.has(warning.field) || !fields[warning.field]
    }
    return true
  })
  return {
    ...fields,
    name,
    slug: slugify(name) || `event-${Date.now()}`,
    source_url: fields.source_url || sourceUrl,
    start_date: startDate,
    start_time: startTime,
    timezone,
    start_at: startAt,
    end_date: endDate,
    end_time: endTime,
    end_at: endAt,
    status: 'draft',
    extraction_status: 'extracted',
    extraction_metadata: {
      extracted_field_count: extraction.extracted_field_count,
      extracted_at: extraction.extracted_at,
      warnings: remainingWarnings,
      research: extraction.research || null,
    },
    extracted_at: extraction.extracted_at,
    missing_fields: (extraction.missing_fields || []).filter((key) => {
      if (key === 'start_date') return !startDate
      if (key === 'start_time') return !startTime
      if (key === 'end_date') return !endDate
      if (key === 'end_time') return !endTime
      if (key === 'timezone') return !timezone
      if (key === 'name') return !name
      return true
    }),
    field_provenance: provenance,
    verification_status: 'needs_review',
  }
}

function missingRequirements(fields) {
  const missing = []
  if (!fields.name?.trim()) missing.push('Event title')
  if (!validDate(fields.start_date || '')) missing.push('Event date')
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(fields.start_time || '')) missing.push('Start time')
  return missing
}

export function AdminDashboardPage() {
  const [events, setEvents] = useState([])
  const [url, setUrl] = useState('')
  const [stage, setStage] = useState('')
  const [error, setError] = useState('')
  const [eventsError, setEventsError] = useState('')
  const [success, setSuccess] = useState(null)
  const [correction, setCorrection] = useState(null)
  const [values, setValues] = useState({ name: '', start_date: '', start_time: '', end_date: '', end_time: '' })
  const [invalidTimes, setInvalidTimes] = useState({})
  const [timeInputGeneration, setTimeInputGeneration] = useState(0)
  const [duplicate, setDuplicate] = useState(null)
  const [draftId, setDraftId] = useState(null)
  const submissionLock = useRef(false)

  const refreshEvents = useCallback(async () => {
    const result = await adminApi.getEvents({ page: 1, page_size: 6, sort: 'updated', direction: 'desc' })
    setEvents(result.events || [])
    setEventsError('')
  }, [])

  useEffect(() => {
    refreshEvents().catch((err) => setEventsError(err.message))
  }, [refreshEvents])

  function requireCorrections(extraction) {
    const fields = extraction.fields || {}
    setCorrection(extraction)
    setInvalidTimes({})
    setTimeInputGeneration((generation) => generation + 1)
    setValues({
      name: fields.name || '',
      start_date: fields.start_date || '',
      start_time: fields.start_time || '',
      end_date: fields.end_date || '',
      end_time: fields.end_time || '',
    })
    setStage('')
  }

  async function publishExtracted(extraction, correctedFields = extraction.fields || {}) {
    const extracted = Object.fromEntries(Object.entries(extraction.fields || {})
      .filter(([, value]) => value != null && value !== '' && (!Array.isArray(value) || value.length)))
    const corrected = Object.fromEntries(Object.entries(correctedFields)
      .filter(([, value]) => value != null && value !== '' && (!Array.isArray(value) || value.length)))
    const candidate = extraction.duplicate
      ? { ...extraction.duplicate, ...extracted, ...corrected }
      : correctedFields
    const unresolvedRequired = (extraction.missing_fields || []).filter((field) => ['start_date', 'start_time', 'timezone'].includes(field))
    const missing = [...new Set([
      ...missingRequirements(candidate),
      ...unresolvedRequired.map((field) => ({
        start_date: 'Event date needs review',
        start_time: 'Start time needs review',
        timezone: 'Confirm the date and time in Asia/Kolkata',
      })[field]),
    ])]
    if (missing.length) {
      let correctionState = { ...extraction, fields: candidate }
      if (!extraction.duplicate && !extraction.draft_id && candidate.name?.trim()) {
        const saved = await adminApi.createEvent(eventPayload(candidate, extraction, url.trim()))
        correctionState = { ...correctionState, draft_id: saved.id }
        setDraftId(saved.id)
      }
      requireCorrections(correctionState)
      return
    }

    setStage('publishing')
    const payload = eventPayload(candidate, extraction, url.trim())
    const duplicateEvent = extraction.duplicate
    let saved
    if (duplicateEvent) {
      if (duplicateEvent.deleted_at) await adminApi.restoreEvent(duplicateEvent.id)
      const current = await adminApi.getEvent(duplicateEvent.id)
      const merged = { ...current, ...candidate }
      const updates = eventPayload(merged, extraction, url.trim())
      delete updates.status
      saved = await adminApi.updateEvent(duplicateEvent.id, updates)
    } else if (extraction.draft_id) {
      const current = await adminApi.getEvent(extraction.draft_id)
      const updates = eventPayload({ ...current, ...candidate }, extraction, url.trim())
      delete updates.status
      saved = await adminApi.updateEvent(extraction.draft_id, updates)
    } else {
      saved = await adminApi.createEvent(payload)
    }
    setDraftId(saved.id)
    let published
    try {
      published = await adminApi.publishEvent(saved.id)
    } catch (err) {
      err.savedDraftId = saved.id
      throw err
    }
    setCorrection(null)
    setSuccess({ event: published })
    setUrl('')
    setStage('')
    setError('')
    setDuplicate(null)
    setDraftId(null)
    setValues({ name: '', start_date: '', start_time: '', end_date: '', end_time: '' })
    setInvalidTimes({})
    setTimeInputGeneration((generation) => generation + 1)
    try {
      await refreshEvents()
    } catch (err) {
      setEventsError(err.message)
    }
  }

  async function importAndPublish(event) {
    event.preventDefault()
    await runSingleSubmission(submissionLock, async () => {
      if (stage) return
      setError('')
      setSuccess(null)
      setDuplicate(null)
      setDraftId(null)
      setCorrection(null)
      setStage('fetching')
      try {
        const extractionRequest = adminApi.importEvent(url.trim())
        await new Promise((resolve) => window.requestAnimationFrame(resolve))
        setStage('extracting')
        setStage('researching')
        const extraction = await extractionRequest
        setStage('validating')
        if (extraction.duplicate) {
          setDuplicate(extraction.duplicate)
          setStage('')
          setError('This source URL is already in your event library. Open the existing record to review or publish it.')
          return
        }
        await publishExtracted(extraction)
      } catch (err) {
        setStage('')
        if (err.savedDraftId) setDraftId(err.savedDraftId)
        setError(err.savedDraftId
          ? `The event was saved as a draft, but publishing failed: ${err.message}`
          : err.message || 'The event could not be imported. Check the URL and try again.')
      }
    })
  }

  async function completeAndPublish(event) {
    event.preventDefault()
    await runSingleSubmission(submissionLock, async () => {
      if (stage || !correction) return
      setError('')
      setStage('validating')
      if (Object.values(invalidTimes).some(Boolean)) {
        setStage('')
        setError('Correct the highlighted time fields before publishing.')
        return
      }
      const correctedFields = { ...correction.fields, ...values, name: values.name.trim() }
      const reviewed = {
        ...correction,
        missing_fields: (correction.missing_fields || []).filter((field) => (
          ['start_date', 'start_time', 'end_date', 'end_time', 'timezone'].includes(field)
              ? field !== 'timezone' && correctedFields[field] === correction.fields?.[field]
            : true
        )),
      }
      const missing = missingRequirements(correctedFields)
      if (missing.length) {
        setStage('')
        setError(`Complete the required details: ${missing.join(', ')}.`)
        return
      }
      try {
        await publishExtracted(reviewed, correctedFields)
      } catch (err) {
        setStage('')
        if (err.savedDraftId) setDraftId(err.savedDraftId)
        setError(err.savedDraftId
          ? `The event was saved as a draft, but publishing failed: ${err.message}`
          : err.message || 'The event could not be published. Please try again.')
      }
    })
  }

  async function updateExistingEvent() {
    await runSingleSubmission(submissionLock, async () => {
      if (stage || !duplicate) return
      setError('')
      setSuccess(null)
      setStage('fetching')
      try {
        setStage('researching')
        const extraction = await adminApi.importEvent(url.trim(), undefined, true)
        setStage('validating')
        await publishExtracted(extraction, extraction.fields || {})
      } catch (err) {
        setStage('')
        if (duplicate?.id) setDraftId(duplicate.id)
        setError(err.message || 'The existing event could not be updated.')
      }
    })
  }

  const activeStageIndex = stages.findIndex(([key]) => key === stage)

  return (
    <div className="admin-page admin-overview">
      <div className="admin-page-heading">
        <div><h1>Your events</h1></div>
      </div>

      <section className="quick-publish" aria-label="Import and publish an event">
        <form className="quick-publish-form" onSubmit={importAndPublish}>
          <label className="sr-only" htmlFor="quick-event-url">Public event URL</label>
          <input id="quick-event-url" type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="Paste an event URL..." required disabled={Boolean(stage)} />
          <button className="admin-primary-button" type="submit" disabled={Boolean(stage) || !url.trim()}>
            {stage ? <LoaderCircle className="spin" size={16} /> : <ArrowUpRight size={16} />}
            {stage ? 'Working…' : 'Import & Publish'}
          </button>
        </form>
        {stage && <ol className="publish-progress" aria-live="polite" aria-label="Import and publish progress">
          {stages.map(([key, label], index) => {
            const complete = activeStageIndex > index
            const active = stage === key
            return <li className={`${complete ? 'is-complete' : ''}${active ? ' is-active' : ''}`} key={key}>
              <span>{complete ? <Check size={12} /> : active ? <LoaderCircle className="spin" size={12} /> : <i />}</span>{label}
            </li>
          })}
        </ol>}

        {error && <div className="admin-alert quick-publish-alert" role="alert">{error}{duplicate && <><Link to={`/admin/events/${duplicate.id}/edit`}>Open “{duplicate.name}” <ArrowUpRight size={13} /></Link><button className="admin-inline-link" type="button" onClick={updateExistingEvent} disabled={Boolean(stage)}>{duplicate.deleted_at ? 'Restore, update & publish' : 'Update existing event'}</button></>}{draftId && <Link to={`/admin/events/${draftId}/edit`}>Open saved draft <ArrowUpRight size={13} /></Link>}</div>}
        {success && <div className="publish-success" role="status"><span><Check size={14} /></span><div><strong>Published successfully</strong><small>{success.event.name} is now live on the public site.</small></div><Link to={`/admin/events/${success.event.id}/edit`} aria-label={`Edit ${success.event.name}`}><ArrowUpRight size={15} /></Link></div>}

        {correction && <form className="required-correction" onSubmit={completeAndPublish}>
          <div><strong>A few details need your help</strong><p>{correction.draft_id ? 'The extracted event is saved privately as a draft. Complete only the required fields.' : correction.failed_import_saved ? 'The incomplete extraction is saved for correction. Complete only the required fields.' : 'Complete only the required fields before the event can be saved.'}</p></div>
          <div className="correction-fields">
            <label className="admin-field">Event title<input autoFocus maxLength={240} value={values.name} onChange={(event) => setValues({ ...values, name: event.target.value })} required /></label>
            <label className="admin-field">Start date<input type="date" value={values.start_date} onChange={(event) => setValues({ ...values, start_date: event.target.value })} required /></label>
            <label className="admin-field">Start time<TimeField value={values.start_time} onChange={(value) => setValues({ ...values, start_time: value })} onValidationChange={(invalid) => setInvalidTimes((current) => current.start_time === invalid ? current : { ...current, start_time: invalid })} resetKey={timeInputGeneration} required /></label>
            <label className="admin-field">End date <span className="optional-label">Optional</span><input type="date" value={values.end_date} onChange={(event) => setValues({ ...values, end_date: event.target.value })} /></label>
            <label className="admin-field">End time <span className="optional-label">Optional</span><TimeField value={values.end_time} onChange={(value) => setValues({ ...values, end_time: value })} onValidationChange={(invalid) => setInvalidTimes((current) => current.end_time === invalid ? current : { ...current, end_time: invalid })} resetKey={timeInputGeneration} /></label>
          </div>
          {correction.missing_fields?.includes('timezone') && <p className="correction-timezone-note">Times use Asia/Kolkata. Review the displayed date and time before publishing.</p>}
          {correction.warnings?.length > 0 && <ul className="correction-warnings">{correction.warnings.map(({ field, message }) => <li key={field}>{message}</li>)}</ul>}
          <button className="admin-primary-button" type="submit" disabled={Boolean(stage)}>{stage ? <LoaderCircle className="spin" size={15} /> : <ArrowUpRight size={15} />}{stage ? 'Publishing…' : 'Complete & publish'}</button>
        </form>}
      </section>

      <div className="admin-section-heading recent-heading"><div><h2>Recent events</h2></div><Link to="/admin/events" className="admin-inline-link">All events <ArrowRight size={14} /></Link></div>
      {eventsError && <div className="admin-alert" role="alert">The recent event list could not be refreshed: {eventsError}</div>}
      {events.length ? <div className="recent-events" role="list">
        {events.map((event) => <article className="recent-event-row" role="listitem" key={event.id}>
          {event.banner_url ? <img className="recent-event-image" src={event.banner_url} alt="" /> : <span className="recent-event-image recent-event-image-empty"><Ticket size={16} /></span>}
          <div className="recent-event-main"><Link to={`/admin/events/${event.id}/edit`}>{event.name}</Link><span>{event.organizer_name || 'Organizer not specified'}</span></div>
          <span className="recent-event-date">{event.start_date || 'Date TBD'}</span>
          <span className={`admin-status status-${event.status || 'draft'}`}><i />{event.status || 'draft'}</span>
          <Link className="recent-event-action" to={`/admin/events/${event.id}/edit`} aria-label={`Open ${event.name}`}><ArrowUpRight size={15} /></Link>
        </article>)}
      </div> : <div className="admin-empty recent-empty"><Ticket size={20} /><strong>{error ? 'Your events could not be loaded' : 'No events yet'}</strong>{error && <span>{error}</span>}<Link to="/admin/events/new/edit"><Plus size={14} /> Create an event</Link></div>}
    </div>
  )
}

export function Status({ status }) {
  return <span className={`admin-status status-${status || 'draft'}`}><i />{status || 'draft'}</span>
}
