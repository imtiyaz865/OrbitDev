import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ArrowUpRight, Image as ImageIcon, Plus, Trash2 } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { TimeField } from '../../components/TimeField.jsx'
import { adminApi } from '../../services/adminApi.js'
import { runSingleSubmission } from '../../utils/singleSubmission.js'
import { classifyEventType, eventTypeOptions } from '../../utils/eventType.js'
import { registrationStatusOptions, registrationStatusSelectValue } from '../../utils/registrationStatus.js'
import { toast } from 'react-toastify'
import { isDuplicateError, showDuplicateToast } from './duplicateToast.jsx'
import { FieldOrigin } from './FieldOrigin.jsx'

const TYPE_SIGNAL_KEYS = new Set(['name', 'description', 'agenda_items', 'attendance_mode'])
// Existing database values; the select keeps any other stored value as an extra option.
const VERIFICATION_OPTIONS = [['needs_review', 'Needs review'], ['verified', 'Verified'], ['unverified', 'Unverified']]
import { AdminImportPage } from './AdminImportPage.jsx'
import { Status } from './AdminDashboardPage.jsx'
import { isoToZonedInput, zonedDateTimeToIso } from '../../utils/weekends.js'
import { eventDateTimeInIndia, INDIA_TIME_ZONE } from '../../utils/times.js'

const listFields = {
  speakers: [
    { key: 'name', label: 'Name' },
    { key: 'role', label: 'Role' },
    { key: 'organization', label: 'Organization' },
    { key: 'image_url', label: 'Image URL' },
    { key: 'biography', label: 'Biography', multiline: true },
  ],
  sponsors: [
    { key: 'name', label: 'Name' },
    { key: 'website', label: 'Website' },
    { key: 'logo_url', label: 'Logo URL' },
  ],
  agenda_items: [
    { key: 'title', label: 'Title' },
    { key: 'start_time', label: 'Start time', type: 'time' },
    { key: 'end_time', label: 'End time', type: 'time' },
    { key: 'speaker_name', label: 'Speaker' },
    { key: 'description', label: 'Description', multiline: true },
  ],
}

const listDefaults = {
  speakers: { name: '', role: '', organization: '', image_url: '', biography: '' },
  sponsors: { name: '', website: '', logo_url: '' },
  agenda_items: { title: '', start_time: '', end_time: '', speaker_name: '', description: '' },
}

function StructuredEntries({ type, entries, onChange }) {
  const fields = listFields[type]
  const label = type === 'agenda_items' ? 'agenda item' : type.slice(0, -1)
  return (
    <details className="editor-disclosure editor-list-disclosure">
      <summary>{type === 'agenda_items' ? 'Agenda' : `${type[0].toUpperCase()}${type.slice(1)}`}<span>{entries.length || 'Optional'}</span></summary>
      <div className="editor-disclosure-content">
        {entries.map((entry, index) => (
          <article className="editor-list-entry" key={entry.id || `${type}-${index}`}>
            <div className="editor-list-entry-heading"><strong>{fields[0].label} {index + 1}</strong><button className="editor-remove-button" type="button" onClick={() => onChange(entries.filter((_item, current) => current !== index))} aria-label={`Remove ${label} ${index + 1}`}><Trash2 size={15} />Remove</button></div>
            <div className="editor-field-grid">
              {fields.map(({ key, label: fieldLabel, type: inputType, multiline }) => (
                <label className={`admin-field${multiline ? ' field-full' : ''}`} key={key}>{fieldLabel}
                  {multiline
                    ? <textarea rows="3" value={entry[key] || ''} onChange={(event) => onChange(entries.map((item, current) => current === index ? { ...item, [key]: event.target.value } : item))} />
                    : inputType === 'time'
                      ? <TimeField value={entry[key]} onChange={(value) => onChange(entries.map((item, current) => current === index ? { ...item, [key]: value } : item))} />
                      : <input type={inputType || (key.endsWith('_url') || key === 'website' ? 'url' : 'text')} value={entry[key] || ''} onChange={(event) => onChange(entries.map((item, current) => current === index ? { ...item, [key]: event.target.value } : item))} />}
                </label>
              ))}
            </div>
          </article>
        ))}
        <button className="editor-add-button" type="button" onClick={() => onChange([...entries, { ...listDefaults[type] }])}><Plus size={15} />Add {label}</button>
      </div>
    </details>
  )
}

function normalizeEventTimezone(event) {
  const start = eventDateTimeInIndia(event, 'start')
  const end = eventDateTimeInIndia(event, 'end')
  return {
    ...event,
    start_date: start?.date || event.start_date || '',
    start_time: start?.time || event.start_time || '',
    end_date: end?.date || event.end_date || '',
    end_time: end?.time || event.end_time || '',
    timezone: INDIA_TIME_ZONE,
  }
}

// Bookkeeping fields the form rewrites on every keystroke; they do not count as user edits.
const untrackedKeys = new Set(['missing_fields', 'field_provenance', 'extraction_metadata', 'updated_at'])

function editableSnapshot(event) {
  if (!event) return ''
  return JSON.stringify(Object.keys(event).sort().filter((key) => !untrackedKeys.has(key)).map((key) => [key, event[key] ?? null]))
}

const leaveMessage = 'You have unsaved changes to this event. Leave without saving?'

/**
 * Warns before leaving with unsaved edits: page reloads/closes (beforeunload) and
 * in-app link clicks (sidebar, back link). The app uses <BrowserRouter>, so React
 * Router's useBlocker is unavailable; browser Back/Forward is not intercepted.
 */
function useUnsavedChangesGuard(active) {
  useEffect(() => {
    if (!active) return undefined
    function onBeforeUnload(unloadEvent) {
      unloadEvent.preventDefault()
      unloadEvent.returnValue = ''
    }
    function onClick(clickEvent) {
      if (clickEvent.defaultPrevented || clickEvent.button !== 0 || clickEvent.metaKey || clickEvent.ctrlKey || clickEvent.shiftKey || clickEvent.altKey) return
      const anchor = clickEvent.target instanceof Element ? clickEvent.target.closest('a[href]') : null
      if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download')) return
      const destination = new URL(anchor.href, window.location.href)
      if (destination.origin !== window.location.origin) return
      if (destination.pathname === window.location.pathname && destination.search === window.location.search) return
      if (!window.confirm(leaveMessage)) {
        clickEvent.preventDefault()
        clickEvent.stopPropagation()
      }
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    document.addEventListener('click', onClick, true)
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
      document.removeEventListener('click', onClick, true)
    }
  }, [active])
}

export function AdminEventEditorPage() {
  const { id } = useParams()
  const [event, setEvent] = useState(null)
  const [savedEvent, setSavedEvent] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const [bannerFailed, setBannerFailed] = useState(false)
  const [invalidTimes, setInvalidTimes] = useState({})
  const submissionLock = useRef(false)
  const isNew = id === 'new'

  useEffect(() => {
    if (isNew) {
      setEvent(null)
      setSavedEvent(null)
      return
    }
    setInvalidTimes({})
    setBannerFailed(false)
    adminApi.getEvent(id).then((record) => {
      const normalized = normalizeEventTimezone(record)
      setEvent(normalized)
      setSavedEvent(normalized)
    }).catch((err) => setError(err.message))
  }, [id, isNew])

  const savedSnapshot = useMemo(() => editableSnapshot(savedEvent), [savedEvent])
  const currentSnapshot = useMemo(() => editableSnapshot(event), [event])
  const dirty = Boolean(event && savedEvent) && currentSnapshot !== savedSnapshot
  useUnsavedChangesGuard(dirty)

  if (isNew) return <AdminImportPage manual />
  if (error && !event) return <div className="admin-page"><div className="admin-alert">{error}</div><Link to="/admin/events" className="admin-inline-link">Back to events</Link></div>
  if (!event) return <div className="admin-loading">Loading event record…</div>

  // Offered (never applied silently) for existing events that have no type yet.
  const suggestedType = event.event_type ? null : classifyEventType(event)

  function updateField(key, value) {
    if (key === 'banner_url') setBannerFailed(false)
    const missingFields = new Set(event.missing_fields || [])
    if (value == null || value === '') missingFields.add(key)
    else missingFields.delete(key)
    const next = {
      ...event,
      [key]: value,
      missing_fields: [...missingFields],
      extraction_metadata: value != null && value !== '' && event.extraction_metadata?.warnings
        ? { ...event.extraction_metadata, warnings: event.extraction_metadata.warnings.filter((warning) => warning.field !== key) }
        : event.extraction_metadata,
      field_provenance: {
        ...event.field_provenance,
        [key]: event.field_provenance?.[key] ? 'manually_edited' : 'manual',
      },
    }
    if (key === 'verification_status') next.last_verified_at = value === 'verified' ? new Date().toISOString() : null
    // Keep suggesting an event type from the title/description/agenda until the administrator sets one.
    if (TYPE_SIGNAL_KEYS.has(key) && (!event.event_type || event.field_provenance?.event_type === 'suggested')) {
      const suggested = classifyEventType(next)
      next.event_type = suggested || ''
      if (suggested) next.field_provenance.event_type = 'suggested'
      else delete next.field_provenance.event_type
    }
    setEvent(next)
  }
  async function persistChanges() {
    if (Object.values(invalidTimes).some(Boolean)) {
      throw new Error('Correct the highlighted time fields before saving.')
    }
    const updated = await adminApi.updateEvent(id, {
      ...event,
      timezone: INDIA_TIME_ZONE,
      source_url: event.source_url || null,
      tags: typeof event.tags === 'string' ? event.tags.split(',').map((tag) => tag.trim()).filter(Boolean) : event.tags,
      start_at: event.start_date && event.start_time && event.timezone
        ? zonedDateTimeToIso(event.start_date, event.start_time, event.timezone)
        : null,
      end_at: event.end_date && event.end_time && event.timezone
        ? zonedDateTimeToIso(event.end_date, event.end_time, event.timezone)
        : null,
      registration_deadline: event.registration_deadline
        ? /(?:Z|[+-]\d{2}:\d{2})$/i.test(event.registration_deadline)
          ? event.registration_deadline
          : event.timezone
            ? zonedDateTimeToIso(event.registration_deadline.slice(0, 10), event.registration_deadline.slice(11, 16), event.timezone)
            : null
        : null,
    })
    const normalized = normalizeEventTimezone(updated)
    setEvent(normalized)
    setSavedEvent(normalized)
    return normalized
  }
  // One action at a time: the ref lock stops a fast double click from sending twice
  // before the disabled state renders.
  function runAction(kind, task) {
    return runSingleSubmission(submissionLock, async () => {
      setBusy(kind); setError('')
      try { await task() } catch (err) { setError(err.message) } finally { setBusy('') }
    })
  }
  function save() {
    return runAction('save', async () => {
      await persistChanges()
      toast.success(event.status === 'published' ? 'Changes saved and live on the public site.' : 'Changes saved.')
    })
  }
  function togglePublish() {
    if (event.status === 'published') {
      return runAction('unpublish', async () => {
        const hadUnsavedEdits = dirty
        const updated = normalizeEventTimezone(await adminApi.unpublishEvent(id))
        // Only the publication status changed on the server; keep any unsaved edits in the form.
        setSavedEvent(updated)
        setEvent((current) => ({ ...current, status: updated.status, updated_at: updated.updated_at }))
        toast.success(hadUnsavedEdits
          ? 'Event unpublished. Your unsaved edits are still in the form; save to keep them.'
          : 'Event unpublished. It is no longer on the public site.')
      })
    }
    return publish()
  }
  // A matching live event blocks publishing until the administrator confirms it is a different event.
  function publish(allowDuplicate = false) {
    return runAction('publish', async () => {
      await persistChanges()
      let record
      try {
        record = await adminApi.publishEvent(id, { allowDuplicate })
      } catch (err) {
        if (!isDuplicateError(err)) throw err
        showDuplicateToast(err.duplicates, { onProceed: () => publish(true), proceedLabel: 'Not a duplicate — publish anyway' })
        return
      }
      const published = normalizeEventTimezone(record)
      setEvent(published)
      setSavedEvent(published)
      toast.success('Event published and live on the public site.')
    })
  }

  return (
    <div className="admin-page admin-event-editor">
      <Link to="/admin/events" className="admin-back"><ArrowLeft size={14} /> All events</Link>
      <div className="admin-page-heading editor-page-heading"><div><span className="admin-eyebrow">EVENT</span><h1>{event.name || 'Edit event'}</h1></div><Status status={event.status} /></div>
      {error && <div className="admin-alert" role="alert">{error}</div>}
      <div className="editor-action-bar">
        <div>
          {dirty && <span className="form-data-state is-missing editor-unsaved">Unsaved changes</span>}
          {event.status === 'published' && <a className="admin-secondary-button" href={`/events/${event.slug}`} target="_blank" rel="noreferrer">View event <ArrowUpRight size={15} /></a>}
          <button className="admin-secondary-button" type="button" onClick={togglePublish} disabled={Boolean(busy)}>{busy === 'publish' ? 'Publishing…' : busy === 'unpublish' ? 'Unpublishing…' : event.status === 'published' ? 'Unpublish' : 'Publish'} <ArrowUpRight size={15} /></button>
          <button className="admin-primary-button" type="button" onClick={save} disabled={Boolean(busy)}>{busy === 'save' ? 'Saving…' : 'Save changes'}</button>
        </div>
      </div>
      <form className="admin-edit-fields editor-form" onSubmit={(submitEvent) => submitEvent.preventDefault()}>
        <section className="editor-primary-fields" aria-label="Essential event details">
          <label className="admin-field editor-title-field">Event title<input autoFocus value={event.name || ''} onChange={(inputEvent) => updateField('name', inputEvent.target.value)} /></label>
          <div className="editor-field-grid editor-date-fields">
            <label className="admin-field">Start date{(!event.start_date || event.missing_fields?.includes('start_date')) && <span className="form-data-state is-missing">Needs review</span>}<input type="date" value={event.start_date || ''} onChange={(inputEvent) => updateField('start_date', inputEvent.target.value)} /></label>
            <label className="admin-field">Start time{(!event.start_time || event.missing_fields?.includes('start_time')) && <span className="form-data-state is-missing">Needs review</span>}<TimeField value={event.start_time} onChange={(value) => updateField('start_time', value)} onValidationChange={(invalid) => setInvalidTimes((current) => current.start_time === invalid ? current : { ...current, start_time: invalid })} resetKey={id} /></label>
            <label className="admin-field">End date{(!event.end_date || event.missing_fields?.includes('end_date')) && <span className="form-data-state is-missing">Needs review</span>}<input type="date" value={event.end_date || ''} onChange={(inputEvent) => updateField('end_date', inputEvent.target.value)} /></label>
            <label className="admin-field">End time{(!event.end_time || event.missing_fields?.includes('end_time')) && <span className="form-data-state is-missing">Needs review</span>}<TimeField value={event.end_time} onChange={(value) => updateField('end_time', value)} onValidationChange={(invalid) => setInvalidTimes((current) => current.end_time === invalid ? current : { ...current, end_time: invalid })} resetKey={id} /></label>
          </div>
          <p className="form-provenance-note">Event times use Asia/Kolkata. Existing records in another timezone are shown converted to Hyderabad local time.</p>
          <div className="editor-field-grid">
            <label className="admin-field">Attendance<select value={event.attendance_mode || ''} onChange={(inputEvent) => updateField('attendance_mode', inputEvent.target.value)}><option value="">Not specified</option><option value="offline">In person</option><option value="online">Online</option><option value="mixed">Hybrid</option></select></label>
            <label className="admin-field">Venue<input value={event.venue_name || ''} onChange={(inputEvent) => updateField('venue_name', inputEvent.target.value)} /></label>
            <label className="admin-field editor-field-full">Organizer<input value={event.organizer_name || ''} onChange={(inputEvent) => updateField('organizer_name', inputEvent.target.value)} /></label>
            <label className="admin-field editor-field-full">Description<textarea rows="6" value={event.description || ''} onChange={(inputEvent) => updateField('description', inputEvent.target.value)} /></label>
          </div>
          <div className="editor-banner-field">
            <label className="admin-field">Banner image URL<input type="url" value={event.banner_url || ''} onChange={(inputEvent) => updateField('banner_url', inputEvent.target.value)} /></label>
            {event.banner_url && !bannerFailed
              ? <img key={event.banner_url} className="editor-banner-preview" src={event.banner_url} referrerPolicy="no-referrer" alt={`${event.name || 'Event'} banner preview`} decoding="async" onError={() => setBannerFailed(true)} />
              : <div className="editor-banner-empty"><ImageIcon size={18} /><span>{bannerFailed ? 'Preview unavailable. Check the image URL.' : 'Banner preview'}</span></div>}
          </div>
        </section>

        <details className="editor-disclosure">
          <summary>Location & registration</summary>
          <div className="editor-disclosure-content editor-field-grid">
            <label className="admin-field">Address<input value={event.address || ''} onChange={(inputEvent) => updateField('address', inputEvent.target.value)} /></label>
            <label className="admin-field">City<input value={event.city || ''} onChange={(inputEvent) => updateField('city', inputEvent.target.value)} /></label>
            <label className="admin-field editor-field-full">Online details<textarea rows="3" value={event.online_details || ''} onChange={(inputEvent) => updateField('online_details', inputEvent.target.value)} /></label>
            <label className="admin-field editor-field-full">Registration URL<input type="url" value={event.registration_url || ''} onChange={(inputEvent) => updateField('registration_url', inputEvent.target.value)} /></label>
            <label className="admin-field">Fee type<input value={event.registration_fee_type || ''} onChange={(inputEvent) => updateField('registration_fee_type', inputEvent.target.value)} /></label>
            <label className="admin-field">Fee amount<input type="number" min="0" step="any" value={event.registration_amount ?? ''} onChange={(inputEvent) => updateField('registration_amount', inputEvent.target.value)} /></label>
            <label className="admin-field">Fee currency<input value={event.registration_currency || ''} onChange={(inputEvent) => updateField('registration_currency', inputEvent.target.value)} /></label>
            <label className="admin-field">Registration status
              <select value={registrationStatusSelectValue(event.registration_status)} onChange={(inputEvent) => updateField('registration_status', inputEvent.target.value)}>
                {registrationStatusOptions(event.registration_status).map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
              </select>
              <FieldOrigin field="registration_status" provenance={event.field_provenance?.registration_status} />
            </label>
            <label className="admin-field">Registration deadline<input type="datetime-local" value={isoToZonedInput(event.registration_deadline, event.timezone)} onChange={(inputEvent) => updateField('registration_deadline', inputEvent.target.value)} /></label>
          </div>
        </details>

        <StructuredEntries type="speakers" entries={event.speakers || []} onChange={(items) => updateField('speakers', items)} />
        <StructuredEntries type="sponsors" entries={event.sponsors || []} onChange={(items) => updateField('sponsors', items)} />
        <StructuredEntries type="agenda_items" entries={event.agenda_items || []} onChange={(items) => updateField('agenda_items', items)} />

        <details className="editor-disclosure">
          <summary>Additional metadata</summary>
          <div className="editor-disclosure-content editor-field-grid">
            <label className="admin-field">URL slug<input value={event.slug || ''} onChange={(inputEvent) => updateField('slug', inputEvent.target.value)} /></label>
            <label className="admin-field">Event type
              <select value={event.event_type || ''} onChange={(inputEvent) => updateField('event_type', inputEvent.target.value)}>
                <option value="">Choose a type…</option>
                {eventTypeOptions(event.event_type).map((type) => <option key={type} value={type}>{type}</option>)}
              </select>
              <FieldOrigin field="event_type" provenance={event.field_provenance?.event_type} />
              {!event.event_type && suggestedType && <button type="button" className="admin-inline-link editor-suggestion" onClick={() => updateField('event_type', suggestedType)}>Use suggested type: {suggestedType}</button>}
            </label>
            <label className="admin-field editor-field-full">Technology tags<input value={Array.isArray(event.tags) ? event.tags.join(', ') : event.tags || ''} onChange={(inputEvent) => updateField('tags', inputEvent.target.value.split(',').map((tag) => tag.trim()).filter(Boolean))} /></label>
            <label className="admin-field">Organizer website<input type="url" value={event.organizer_website || ''} onChange={(inputEvent) => updateField('organizer_website', inputEvent.target.value)} /></label>
            <label className="admin-field">Organizer logo URL<input type="url" value={event.organizer_logo_url || ''} onChange={(inputEvent) => updateField('organizer_logo_url', inputEvent.target.value)} /></label>
            <label className="admin-field">Original banner URL<input type="url" value={event.original_banner_url || ''} onChange={(inputEvent) => updateField('original_banner_url', inputEvent.target.value)} /></label>
            <label className="admin-field">Verification status
              <select value={event.verification_status || 'needs_review'} onChange={(inputEvent) => updateField('verification_status', inputEvent.target.value)}>
                {[...new Set([...VERIFICATION_OPTIONS.map(([value]) => value), event.verification_status].filter(Boolean))].map((value) => (
                  <option key={value} value={value}>{VERIFICATION_OPTIONS.find(([option]) => option === value)?.[1] || value}</option>
                ))}
              </select>
            </label>
          </div>
        </details>

        <details className="editor-disclosure">
          <summary>Source & extraction</summary>
          <div className="editor-disclosure-content editor-field-grid">
            <label className="admin-field editor-field-full">Source URL<input type="url" value={event.source_url || ''} onChange={(inputEvent) => updateField('source_url', inputEvent.target.value)} /></label>
            <label className="admin-field">Source platform<input value={event.source_platform || ''} onChange={(inputEvent) => updateField('source_platform', inputEvent.target.value)} /></label>
            <label className="admin-field">Source page title<input value={event.source_title || ''} onChange={(inputEvent) => updateField('source_title', inputEvent.target.value)} /></label>
            <label className="admin-field">Extraction status<input value={event.extraction_status || ''} onChange={(inputEvent) => updateField('extraction_status', inputEvent.target.value)} /></label>
            {event.extraction_metadata?.warnings?.length > 0 && <ul className="editor-warning-list editor-field-full">{event.extraction_metadata.warnings.map(({ field, message }) => <li key={field}><strong>{field.replaceAll('_', ' ')}</strong> {message}</li>)}</ul>}
          </div>
        </details>

        <details className="editor-disclosure editor-history-disclosure">
          <summary>Record history</summary>
          <dl className="editor-history-list">
            <div><dt>Source</dt><dd>{event.source_platform || 'Manual entry'}</dd></div>
            <div><dt>Extracted</dt><dd>{event.extracted_at ? new Date(event.extracted_at).toLocaleString() : 'Not extracted'}</dd></div>
            <div><dt>Last verified</dt><dd>{event.last_verified_at ? new Date(event.last_verified_at).toLocaleString() : 'Not verified'}</dd></div>
            <div><dt>Updated</dt><dd>{event.updated_at ? new Date(event.updated_at).toLocaleString() : '—'}</dd></div>
            <div><dt>Missing fields</dt><dd>{event.missing_fields?.length ? event.missing_fields.join(', ') : 'None recorded'}</dd></div>
            <div><dt>Field provenance</dt><dd>{Object.keys(event.field_provenance || {}).length ? Object.keys(event.field_provenance).join(', ') : 'None recorded'}</dd></div>
          </dl>
        </details>
      </form>
    </div>
  )
}
