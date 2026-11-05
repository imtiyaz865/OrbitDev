import { useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, ArrowUpRight, Check, ExternalLink, ImagePlus, Link2, LoaderCircle, Plus, Trash2 } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { TimeField } from '../../components/TimeField.jsx'
import { adminApi } from '../../services/adminApi.js'
import { isoToZonedInput, zonedDateTimeToIso } from '../../utils/weekends.js'
import { format12HourTime, INDIA_TIME_ZONE } from '../../utils/times.js'
import { runSingleSubmission } from '../../utils/singleSubmission.js'

const emptyEvent = {
  name: '', slug: '', description: '', event_type: '', tags: [],
  start_at: null, end_at: null, start_date: '', start_time: '', end_date: '', end_time: '', timezone: '',
  attendance_mode: '', venue_name: '', address: '', city: '', online_details: '',
  organizer_name: '', organizer_website: '', organizer_logo_url: '',
  sponsors: [], speakers: [], agenda_items: [],
  registration_url: '', registration_fee_type: '', registration_amount: '', registration_currency: '', registration_deadline: '', registration_status: '',
  banner_url: '', source_url: '', source_platform: '', source_title: '',
  extraction_status: 'manual', extraction_metadata: {}, field_provenance: {}, missing_fields: [], verification_status: 'needs_review',
  extracted_at: null, last_verified_at: null,
}

function blankManualEvent() {
  return { ...emptyEvent, timezone: INDIA_TIME_ZONE }
}

function slugify(name) {
  return name.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function sourceHostname(value) {
  try { return new URL(value).hostname } catch { return 'Link preview' }
}

export function AdminImportPage({ manual = false }) {
  const navigate = useNavigate()
  const [url, setUrl] = useState('')
  const [result, setResult] = useState(manual ? { mode: 'manual', fields: {}, missing_fields: [], extracted_field_count: 0, extracted_at: null } : null)
  const [event, setEvent] = useState(() => manual ? blankManualEvent() : emptyEvent)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [saving, setSaving] = useState(false)
  const [draftId, setDraftId] = useState(null)
  const [success, setSuccess] = useState('')
  const [imageFailed, setImageFailed] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [invalidTimes, setInvalidTimes] = useState({})
  const [timeInputGeneration, setTimeInputGeneration] = useState(0)
  const submissionLock = useRef(false)

  function validateTime(key, invalid) {
    setInvalidTimes((current) => current[key] === invalid ? current : { ...current, [key]: invalid })
  }

  function update(key, value) {
    const isEmpty = value == null || value === '' || (Array.isArray(value) && value.length === 0)
    if (!isEmpty) {
      setResult((currentResult) => currentResult
        ? { ...currentResult, warnings: currentResult.warnings?.filter((warning) => warning.field !== key) }
        : currentResult)
    }
    setEvent((current) => {
      const next = { ...current, [key]: value }
      if (key === 'start_date' || key === 'start_time' || key === 'timezone') next.start_at = null
      if (key === 'end_date' || key === 'end_time' || key === 'timezone') next.end_at = null
      if (key === 'name' && (!current.slug || current.slug === slugify(current.name))) next.slug = slugify(value)
      const missing = new Set(current.missing_fields || [])
      if (isEmpty) missing.add(key)
      else missing.delete(key)
      next.missing_fields = [...missing]
      next.field_provenance = {
        ...current.field_provenance,
        [key]: current.field_provenance?.[key] ? 'manually_edited' : 'manual',
      }
      if (!isEmpty && current.extraction_metadata?.warnings) {
        next.extraction_metadata = {
          ...current.extraction_metadata,
          warnings: current.extraction_metadata.warnings.filter((warning) => warning.field !== key),
        }
      }
      return next
    })
  }

  function fieldStatus(key) {
    if (event.missing_fields?.includes(key)) return 'Needs review'
    if (event.field_provenance?.[key] === 'manually_edited') return 'Manually edited'
    if (event.field_provenance?.[key] === 'extracted') return 'Extracted'
    if (!event[key]) return 'Missing'
    return 'Manual'
  }

  async function extract(e) {
    e.preventDefault()
    setError('')
    setSuccess('')
    setResult(null)
    setTimeInputGeneration((generation) => generation + 1)
    setBusy(true)
    setInvalidTimes({})
    try {
      const extraction = await adminApi.importEvent(url.trim())
      const fields = extraction.fields || {}
      setEvent({
        ...emptyEvent,
        ...fields,
        timezone: fields.timezone || INDIA_TIME_ZONE,
        name: fields.name || '',
        slug: slugify(fields.name || ''),
        start_date: fields.start_date || '',
        start_time: fields.start_time || '',
        end_date: fields.end_date || '',
        end_time: fields.end_time || '',
        source_url: fields.source_url || url,
        extraction_status: 'extracted',
        extraction_metadata: { extracted_field_count: extraction.extracted_field_count, extracted_at: extraction.extracted_at, warnings: extraction.warnings || [] },
        extracted_at: extraction.extracted_at,
        missing_fields: extraction.missing_fields || [],
        field_provenance: Object.fromEntries(Object.entries(fields).filter(([, value]) => value != null && value !== '' && (!Array.isArray(value) || value.length > 0)).map(([key]) => [key, 'extracted'])),
      })
      setResult(extraction)
      setImageFailed(false)
    } catch (err) {
      setError(`${err.message} You can still create a draft by entering the event details below.`)
      setEvent({ ...blankManualEvent(), source_url: url.trim() })
      setResult({ mode: 'unavailable', fields: {}, missing_fields: [], extracted_field_count: 0, extracted_at: null })
    } finally {
      setBusy(false)
    }
  }

  async function save(status) {
    await runSingleSubmission(submissionLock, async () => {
      if (saving || busy) return
      setError('')
      setSuccess('')
      if (Object.values(invalidTimes).some(Boolean)) {
        setError('Correct the highlighted time fields before saving.')
        return
      }
      setSaving(true)
      try {
        const payload = {
          ...event,
          status: 'draft',
          timezone: INDIA_TIME_ZONE,
          source_url: event.source_url || null,
          start_at: event.start_date && event.start_time
            ? zonedDateTimeToIso(event.start_date, event.start_time, INDIA_TIME_ZONE)
            : null,
          end_at: event.end_date && event.end_time
            ? zonedDateTimeToIso(event.end_date, event.end_time, INDIA_TIME_ZONE)
            : null,
          start_date: event.start_date || null,
          start_time: event.start_time || null,
          end_date: event.end_date || null,
          end_time: event.end_time || null,
          registration_amount: event.registration_amount ? Number(event.registration_amount) : null,
          registration_deadline: event.registration_deadline
            ? /(?:Z|[+-]\d{2}:\d{2})$/i.test(event.registration_deadline)
              ? event.registration_deadline
              : zonedDateTimeToIso(event.registration_deadline.slice(0, 10), event.registration_deadline.slice(11, 16), INDIA_TIME_ZONE)
            : null,
          sponsors: event.sponsors,
          speakers: event.speakers,
          agenda_items: event.agenda_items,
        }
        const saved = draftId
          ? await adminApi.updateEvent(draftId, payload)
          : await adminApi.createEvent(payload)
        if (!draftId) setDraftId(saved.id)
        if (status === 'published') {
          let published
          try {
            published = await adminApi.publishEvent(saved.id)
          } catch (err) {
            setError(`Draft saved, but it could not be published: ${err.message}. Your details are still here; try again after resolving the issue.`)
            return
          }
          setSuccess(`${published.name} is now published. You can add another event.`)
          setUrl('')
          setDraftId(null)
          setEvent(manual ? blankManualEvent() : emptyEvent)
          setResult(manual ? { mode: 'manual', fields: {}, missing_fields: [], extracted_field_count: 0, extracted_at: null } : null)
          setError('')
          setInvalidTimes({})
          setTimeInputGeneration((generation) => generation + 1)
          setImageFailed(false)
          setPreviewOpen(false)
          return
        }
        navigate(`/admin/events/${saved.id}/edit`)
      } catch (err) {
        setError(err.message)
      } finally {
        setSaving(false)
      }
    })
  }

  function addItem(key, blank) { update(key, [...event[key], blank]) }
  function editItem(key, index, field, value) {
    update(key, event[key].map((item, current) => current === index ? { ...item, [field]: value } : item))
  }
  function removeItem(key, index) { update(key, event[key].filter((_item, current) => current !== index)) }

  return (
    <div className="admin-page admin-import-page">
      <Link to="/admin" className="admin-back"><ArrowLeft size={14} /> Workspace</Link>
      <div className="admin-page-heading"><div><span className="admin-eyebrow">ADD TO THE ORBIT</span><h1>Bring an event in.</h1><p>Start with a public page. You’ll review every detail before it goes live.</p></div></div>
      <form className="import-url-panel" onSubmit={extract}>
        <label htmlFor="source-url"><Link2 size={16} /> EVENT PAGE URL</label>
        <div><input id="source-url" type="url" placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} required disabled={busy || saving} /><button className="admin-primary-button" disabled={busy || saving || !url.trim()}>{busy ? <LoaderCircle className="spin" size={15} /> : <ArrowRight size={15} />}{busy ? 'Fetching details…' : 'Fetch event details'}</button></div>
        <p>Public event pages only. Retrieved details are reviewable before publishing; sites that block access can still be entered manually.</p>
        <button className="manual-entry-link" type="button" onClick={() => { setResult({ mode: 'manual', fields: {}, missing_fields: [], extracted_field_count: 0, extracted_at: null }); setEvent(blankManualEvent()); setInvalidTimes({}); setTimeInputGeneration((generation) => generation + 1); setError('') }}>Or start with a blank event record</button>
        {url && <div className="source-preview">
          <div className="source-preview-mark"><ExternalLink size={17} /></div>
          <div className="source-preview-copy"><strong>{sourceHostname(url)}</strong><span>{url}</span></div>
          <span className="source-preview-domain">{sourceHostname(url)}</span>
        </div>}
      </form>

      {success && <div className="admin-success" role="status"><Check size={15} />{success}</div>}
      {error && <div className="admin-alert" role="alert">{error}</div>}
      {result && <div className="extraction-summary"><span className="extraction-check"><Check size={13} /></span>{result.mode === 'unavailable' ? <strong>Extraction unavailable · enter event details manually</strong> : result.mode === 'manual' ? <strong>Manual entry · all fields are editable</strong> : <><strong>{result.extracted_field_count || 0} fields extracted</strong><span>·</span><span>{event.missing_fields?.length || 0} fields need attention</span></>}{result.duplicate && <span className="duplicate-note">Possible match: <Link to={`/admin/events/${result.duplicate.id}/edit`}>{result.duplicate.name}</Link></span>}{result.warnings?.length > 0 && <ul className="extraction-warnings" aria-label="Extraction warnings">{result.warnings.map(({ field, message }) => <li key={field}>{message}</li>)}</ul>}</div>}

      {(result || url) && <div className="admin-form-layout">
        <form className="event-edit-form" onSubmit={(e) => e.preventDefault()}>
          <section className="form-section"><SectionHead letter="A" title="Basic information" status={fieldStatus('name')} /><div className="form-grid">
            <Field label="Event name" required><input value={event.name} onChange={(e) => update('name', e.target.value)} /></Field>
            <Field label="URL slug" required><input value={event.slug} onChange={(e) => update('slug', slugify(e.target.value))} /></Field>
            <Field label="Event type"><input value={event.event_type || ''} onChange={(e) => update('event_type', e.target.value)} placeholder="Meetup, workshop, hackathon…" /></Field>
            <Field label="Technology tags"><input value={(event.tags || []).join(', ')} onChange={(e) => update('tags', e.target.value.split(',').map((tag) => tag.trim()).filter(Boolean))} placeholder="React, AI, design systems" /></Field>
            <Field label="Description" className="field-full"><textarea rows="5" value={event.description || ''} onChange={(e) => update('description', e.target.value)} /></Field>
          </div></section>

          <section className="form-section"><SectionHead letter="B" title="Date & time" status={fieldStatus('start_date')} /><div className="form-grid">
            <Field label="Start date" required status={fieldStatus('start_date')}><input type="date" value={event.start_date || ''} onChange={(e) => update('start_date', e.target.value)} /></Field>
            <Field label="Start time" status={fieldStatus('start_time')}><TimeField value={event.start_time} onChange={(value) => update('start_time', value)} onValidationChange={(invalid) => validateTime('start_time', invalid)} resetKey={timeInputGeneration} /></Field>
            <Field label="End date" status={fieldStatus('end_date')}><input type="date" value={event.end_date || ''} onChange={(e) => update('end_date', e.target.value)} /></Field>
            <Field label="End time" status={fieldStatus('end_time')}><TimeField value={event.end_time} onChange={(value) => update('end_time', value)} onValidationChange={(invalid) => validateTime('end_time', invalid)} resetKey={timeInputGeneration} /></Field>
          </div></section>
          <p className="form-provenance-note">Event times are stored in Asia/Kolkata. Confirm any timezone conversion warnings against the original source.</p>

          <section className="form-section"><SectionHead letter="C" title="Venue & attendance" /><div className="form-grid">
            <Field label="Attendance mode"><select value={event.attendance_mode || ''} onChange={(e) => update('attendance_mode', e.target.value)}><option value="">Not specified</option><option value="offline">In person</option><option value="online">Online</option><option value="mixed">Hybrid</option></select></Field>
            <Field label="Venue"><input value={event.venue_name || ''} onChange={(e) => update('venue_name', e.target.value)} /></Field>
            <Field label="Address"><input value={event.address || ''} onChange={(e) => update('address', e.target.value)} /></Field>
            <Field label="City"><input value={event.city || ''} onChange={(e) => update('city', e.target.value)} /></Field>
            <Field label="Online details" className="field-full"><textarea rows="2" value={event.online_details || ''} onChange={(e) => update('online_details', e.target.value)} /></Field>
          </div></section>

          <section className="form-section"><SectionHead letter="D" title="Organizer" /><div className="form-grid">
            <Field label="Community / organization"><input value={event.organizer_name || ''} onChange={(e) => update('organizer_name', e.target.value)} /></Field>
            <Field label="Website"><input type="url" value={event.organizer_website || ''} onChange={(e) => update('organizer_website', e.target.value)} /></Field>
            <Field label="Logo URL" className="field-full"><input type="url" value={event.organizer_logo_url || ''} onChange={(e) => update('organizer_logo_url', e.target.value)} /></Field>
          </div></section>

          <RepeatableSection letter="E" title="Sponsors" items={event.sponsors} fields={[['name', 'Name'], ['website', 'Website URL'], ['logo_url', 'Logo URL']]} onAdd={() => addItem('sponsors', { name: '', website: '', logo_url: '' })} onEdit={(i, f, v) => editItem('sponsors', i, f, v)} onRemove={(i) => removeItem('sponsors', i)} />
          <RepeatableSection letter="F" title="Speakers" items={event.speakers} fields={[['name', 'Name'], ['role', 'Role / title'], ['organization', 'Organization'], ['image_url', 'Image URL'], ['biography', 'Biography']]} onAdd={() => addItem('speakers', { name: '', role: '', organization: '', image_url: '', biography: '' })} onEdit={(i, f, v) => editItem('speakers', i, f, v)} onRemove={(i) => removeItem('speakers', i)} />
          <RepeatableSection letter="G" title="Agenda" items={event.agenda_items} fields={[['title', 'Session title'], ['start_time', 'Start time'], ['end_time', 'End time'], ['speaker_name', 'Speaker'], ['description', 'Description']]} onAdd={() => addItem('agenda_items', { title: '', start_time: '', end_time: '', speaker_name: '', description: '' })} onEdit={(i, f, v) => editItem('agenda_items', i, f, v)} onRemove={(i) => removeItem('agenda_items', i)} />

          <section className="form-section"><SectionHead letter="H" title="Registration" /><div className="form-grid">
            <Field label="Registration URL" className="field-full"><input type="url" value={event.registration_url || ''} onChange={(e) => update('registration_url', e.target.value)} /></Field>
            <Field label="Fee type"><select value={event.registration_fee_type || ''} onChange={(e) => update('registration_fee_type', e.target.value)}><option value="">Unknown</option><option value="free">Free</option><option value="paid">Paid</option><option value="donation">Donation</option></select></Field>
            <Field label="Amount"><input type="number" min="0" step="0.01" value={event.registration_amount || ''} onChange={(e) => update('registration_amount', e.target.value)} /></Field>
            <Field label="Currency"><input value={event.registration_currency || ''} onChange={(e) => update('registration_currency', e.target.value)} placeholder="USD" /></Field>
            <Field label="Deadline"><input type="datetime-local" value={isoToZonedInput(event.registration_deadline, event.timezone)} onChange={(e) => update('registration_deadline', e.target.value)} /></Field>
            <Field label="Status"><input value={event.registration_status || ''} onChange={(e) => update('registration_status', e.target.value)} placeholder="Open, waitlist…" /></Field>
          </div></section>

          <section className="form-section"><SectionHead letter="I" title="Media" status={fieldStatus('banner_url')} /><div className="form-grid">
            <Field label="Original banner URL" className="field-full"><input type="url" value={event.original_banner_url || ''} onChange={(e) => update('original_banner_url', e.target.value)} /></Field>
            <Field label="Banner image URL to display" className="field-full"><input type="url" value={event.banner_url || ''} onChange={(e) => { update('banner_url', e.target.value); setImageFailed(false) }} /></Field>
          </div>
          {event.banner_url && <div className="banner-preview">{imageFailed ? <div><ImagePlus size={19} /><span>Preview unavailable. Check the image URL.</span></div> : <img src={event.banner_url} alt="Event banner preview" decoding="async" onError={() => setImageFailed(true)} />}<button type="button" onClick={() => update('banner_url', '')}><Trash2 size={13} /> Remove image</button></div>}
          </section>

          <section className="form-section"><SectionHead letter="J" title="Source & verification" status={event.verification_status === 'verified' ? 'Verified' : 'Needs review'} /><div className="form-grid">
            <Field label="Original event URL" className="field-full"><input type="url" value={event.source_url || ''} onChange={(e) => update('source_url', e.target.value)} /></Field>
            <Field label="Source platform"><input value={event.source_platform || ''} onChange={(e) => update('source_platform', e.target.value)} /></Field>
            <Field label="Source page title"><input value={event.source_title || ''} onChange={(e) => update('source_title', e.target.value)} /></Field>
            <Field label="Verification status" className="field-full"><select value={event.verification_status || 'needs_review'} onChange={(e) => update('verification_status', e.target.value)}><option value="needs_review">Needs review</option><option value="verified">Verified</option><option value="unverified">Unverified</option></select></Field>
          </div><p className="form-provenance-note">Extracted values are shown as read from the source. Changes you make here are saved as your reviewed record.</p></section>
        </form>
        <aside className="event-form-aside">
          <div className="event-form-sticky">
            <span className="admin-eyebrow">PUBLIC PREVIEW</span>
            {event.banner_url && !imageFailed ? <img className="aside-banner" src={event.banner_url} alt="" decoding="async" onError={() => setImageFailed(true)} /> : <div className="aside-banner aside-banner-empty"><ImagePlus size={20} /><span>Event image</span></div>}
            <h3>{event.name || 'Your event title'}</h3>
            <p>{event.start_date || 'Date to be confirmed'}{event.start_time ? ` · ${format12HourTime(event.start_time)}` : ''}</p>
            <p>{event.event_type || 'Event type'}{event.organizer_name ? ` · ${event.organizer_name}` : ''}</p>
            <div className="form-aside-divider" />
            <p className="aside-completeness">Required for publishing</p>
            <Checklist label="Event name" complete={Boolean(event.name.trim())} />
            <Checklist label="Start date" complete={Boolean(event.start_date)} />
            <Checklist label="Start time" complete={Boolean(event.start_time)} />
            <Checklist label="Source URL" complete={Boolean(event.source_url)} />
            <div className="form-action-stack">
              <button className="admin-preview-button" type="button" disabled={!event.name.trim()} onClick={() => setPreviewOpen(true)}>Preview event <ArrowUpRight size={14} /></button>
              <button className="admin-primary-button" disabled={saving || busy || !event.name.trim() || !event.slug} onClick={() => save('draft')}>{saving ? 'Saving…' : 'Save draft'} <ArrowRight size={14} /></button>
              <button className="admin-secondary-button" disabled={saving || busy || !event.name.trim() || !event.start_date || !event.timezone} onClick={() => save('published')}>{saving ? 'Publishing…' : 'Publish event'} <ArrowUpRight size={14} /></button>
            </div>
            <p className="publish-note">{!event.start_date ? 'Publishing requires a start date. Fill in the missing event details first.' : `Event times use ${INDIA_TIME_ZONE}. You can edit or unpublish this event at any time.`}</p>
          </div>
        </aside>
      </div>}
      {previewOpen && <PreviewModal event={event} onClose={() => setPreviewOpen(false)} />}
    </div>
  )
}

function SectionHead({ letter, title, status }) {
  return <div className="form-section-head"><span className="form-letter">{letter}</span><h2>{title}</h2>{status && <span className={`form-data-state${status === 'Missing' || status === 'Needs review' ? ' is-missing' : ''}`}>{status}</span>}</div>
}

function Field({ label, required, className = '', status, children }) {
  return <label className={`admin-field ${className}`}>{label}{required && <span className="required-mark"> *</span>}{status && <span className={`form-data-state${status === 'Missing' || status === 'Needs review' ? ' is-missing' : ''}`}>{status}</span>}{children}</label>
}

function Checklist({ label, complete }) {
  return <div className={`form-check${complete ? ' is-complete' : ''}`}><span>{complete ? <Check size={11} /> : null}</span>{label}</div>
}

function PreviewModal({ event, onClose }) {
  return (
    <div className="event-preview-overlay" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <section className="event-preview-modal" role="dialog" aria-modal="true" aria-labelledby="preview-title">
        <div className="event-preview-top"><span className="admin-eyebrow">PUBLIC EVENT PREVIEW</span><button type="button" onClick={onClose} aria-label="Close preview">×</button></div>
        {event.banner_url && <img className="event-preview-banner" src={event.banner_url} alt="" loading="lazy" decoding="async" />}
        <p className="section-eyebrow"><span className="kicker-line" />{event.event_type || 'COMMUNITY EVENT'}</p>
        <h2 id="preview-title">{event.name || 'Your event title'}</h2>
        <div className="event-preview-facts"><span>{event.start_date || 'Date to be confirmed'}{event.start_time ? ` · ${format12HourTime(event.start_time)}` : ' · Time to be confirmed'}</span>{event.organizer_name && <span>Organized by {event.organizer_name}</span>}{(event.venue_name || event.city) && <span>{[event.venue_name, event.city].filter(Boolean).join(', ')}</span>}</div>
        {event.description && <div className="event-preview-description">{event.description}</div>}
        <button className="admin-primary-button" type="button" onClick={onClose}>Back to editing</button>
      </section>
    </div>
  )
}

function RepeatableSection({ letter, title, items, fields, onAdd, onEdit, onRemove }) {
  return <section className="form-section">
    <div className="form-section-head"><span className="form-letter">{letter}</span><h2>{title}</h2><span className="repeat-count">{items.length} {items.length === 1 ? 'item' : 'items'}</span></div>
    <div className="repeatable-list">{items.map((item, index) => <div className="repeatable-item" key={index}><div className="repeatable-title"><span>{title.slice(0, -1)} {String(index + 1).padStart(2, '0')}</span><button type="button" onClick={() => onRemove(index)} aria-label={`Remove ${title.toLowerCase()} item`}><Trash2 size={13} /></button></div><div className="form-grid">{fields.map(([key, label]) => <label className={`admin-field${key === 'description' || key === 'biography' ? ' field-full' : ''}`} key={key}>{label}{key === 'description' || key === 'biography' ? <textarea rows="2" value={item[key] || ''} onChange={(e) => onEdit(index, key, e.target.value)} /> : key.endsWith('_time') ? <TimeField value={item[key]} onChange={(value) => onEdit(index, key, value)} /> : <input value={item[key] || ''} onChange={(e) => onEdit(index, key, e.target.value)} />}</label>)}</div></div>)}</div>
    <button className="repeat-add" type="button" onClick={onAdd}><Plus size={14} /> Add {title.toLowerCase().replace(/s$/, '')}</button>
  </section>
}
