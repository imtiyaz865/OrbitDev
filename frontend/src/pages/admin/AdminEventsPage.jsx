import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, ArrowUpRight, RotateCcw, Search, Ticket, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { adminApi } from '../../services/adminApi.js'
import { formatEventTimeInIndia } from '../../utils/times.js'
import { Status } from './AdminDashboardPage.jsx'

const filters = [
  { label: 'All', value: '' },
  { label: 'Published', value: 'published' },
  { label: 'Drafts', value: 'draft' },
]
const retentionPeriod = 30 * 24 * 60 * 60 * 1000

function displayDate(value) {
  if (!value) return 'Date TBD'
  try {
    return format(parseISO(value), 'EEE, d MMM yyyy')
  } catch {
    return value
  }
}

function recoveryDays(deletedAt) {
  return Math.max(0, Math.ceil((retentionPeriod - (Date.now() - Date.parse(deletedAt))) / (24 * 60 * 60 * 1000)))
}

export function AdminEventsPage() {
  const [events, setEvents] = useState([])
  const [deletedEvents, setDeletedEvents] = useState([])
  const [total, setTotal] = useState(0)
  const [deletedTotal, setDeletedTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('')
  const [sort, setSort] = useState('updated')
  const [search, setSearch] = useState('')
  const [showDeleted, setShowDeleted] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [confirmation, setConfirmation] = useState(null)
  const [busy, setBusy] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const dialogRef = useRef(null)

  useEffect(() => {
    let active = true
    setLoading(true)
    Promise.all([
      adminApi.getEvents({ page, page_size: 20, status, search, sort, direction: sort === 'name' ? 'asc' : 'desc' }),
      adminApi.getDeletedEvents({ page: 1, page_size: 100, search }),
    ])
      .then(([activeResult, deletedResult]) => {
        if (!active) return
        setEvents(activeResult.events || [])
        setTotal(activeResult.total || 0)
        setDeletedEvents(deletedResult.events || [])
        setDeletedTotal(deletedResult.total || 0)
        setError('')
      })
      .catch((err) => { if (active) setError(err.message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [page, status, search, sort, refreshKey])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (confirmation && !dialog.open) dialog.showModal()
    if (!confirmation && dialog.open) dialog.close()
  }, [confirmation])

  async function confirmAction() {
    if (!confirmation) return
    setBusy(true)
    setError('')
    try {
      if (confirmation.permanent) await adminApi.permanentlyDeleteEvent(confirmation.event.id)
      else await adminApi.deleteEvent(confirmation.event.id)
      setConfirmation(null)
      setRefreshKey((key) => key + 1)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function restoreEvent(event) {
    setBusy(true)
    setError('')
    try {
      await adminApi.restoreEvent(event.id)
      setRefreshKey((key) => key + 1)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const visibleEvents = showDeleted ? deletedEvents : events
  const visibleTotal = showDeleted ? deletedTotal : total

  return (
    <div className="admin-page admin-events-page">
      <div className="admin-page-heading">
        <div><h1>Events</h1></div>
        <Link className="admin-secondary-button" to="/admin/import"><Ticket size={15} /> Add event</Link>
      </div>
      <div className="event-library-controls">
        <label className="admin-search"><Search size={16} /><input value={search} onChange={(event) => { setPage(1); setSearch(event.target.value) }} placeholder="Search events" aria-label="Search events" /></label>
        {!showDeleted && <div className="event-filter-tabs" role="group" aria-label="Filter events">
          {filters.map((filter) => <button className={status === filter.value ? 'is-selected' : ''} key={filter.value} onClick={() => { setPage(1); setStatus(filter.value) }} aria-pressed={status === filter.value}>{filter.label}</button>)}
        </div>}
        <button className={`event-trash-toggle${showDeleted ? ' is-selected' : ''}`} type="button" onClick={() => { setPage(1); setShowDeleted((visible) => !visible) }} aria-pressed={showDeleted}>
          <Trash2 size={14} /> Recently Deleted <span>{deletedTotal}</span>
        </button>
        {!showDeleted && <>
          <label className="sr-only" htmlFor="event-sort">Sort events</label>
          <select id="event-sort" value={sort} onChange={(event) => setSort(event.target.value)} aria-label="Sort events"><option value="updated">Recently updated</option><option value="date">Event date</option><option value="name">Name</option></select>
        </>}
        <span className="admin-result-count">{visibleTotal} {visibleTotal === 1 ? 'event' : 'events'}</span>
      </div>
      {error && <div className="admin-alert" role="alert">{error}</div>}
      {showDeleted && <p className="trash-retention-note">Deleted events are recoverable for 30 days. Restoring keeps the existing publication status.</p>}
      <div className="event-library-list">
        <div className={`event-library-head${showDeleted ? ' is-deleted' : ''}`} aria-hidden="true">
          <span>EVENT</span><span>{showDeleted ? 'DELETED' : 'DATE'}</span>{!showDeleted && <><span>ORGANIZER</span><span>STATUS</span></>}<span />
        </div>
        {visibleEvents.map((event) => showDeleted ? (
          <article className="event-library-row is-deleted" key={event.id}>
            {event.banner_url ? <img className="library-event-image" src={event.banner_url} alt="" loading="lazy" decoding="async" /> : <span className="library-event-image library-event-image-empty"><Ticket size={16} /></span>}
            <div className="library-event-title"><strong>{event.name}</strong><small>{event.event_type || event.source_platform || 'Event'} · <Status status={event.status} /></small></div>
            <span className="library-event-date">{displayDate(event.deleted_at)}<small>{recoveryDays(event.deleted_at)} days remaining</small></span>
            <div className="trash-event-actions">
              <button className="admin-secondary-button" type="button" onClick={() => restoreEvent(event)} disabled={busy} aria-label={`Restore ${event.name}`}><RotateCcw size={14} /> Restore</button>
              <button className="admin-danger-button" type="button" onClick={() => setConfirmation({ event, permanent: true })} disabled={busy} aria-label={`Delete ${event.name} permanently`}><Trash2 size={14} /> Delete permanently</button>
            </div>
          </article>
        ) : (
          <article className="event-library-row" key={event.id}>
            {event.banner_url ? <img className="library-event-image" src={event.banner_url} alt="" loading="lazy" decoding="async" /> : <span className="library-event-image library-event-image-empty"><Ticket size={16} /></span>}
            <div className="library-event-title"><Link to={`/admin/events/${event.id}/edit`}>{event.name}</Link><small>{event.event_type || event.source_platform || 'Event'}</small></div>
            <span className="library-event-date">{displayDate(event.start_date)}{event.start_time && <small>{formatEventTimeInIndia(event)}</small>}</span>
            <span className="library-event-organizer">{event.organizer_name || 'Not specified'}</span>
            <Status status={event.status} />
            <div className="library-row-actions">
              <Link className="recent-event-action" to={`/admin/events/${event.id}/edit`} aria-label={`Open ${event.name}`}><ArrowUpRight size={15} /></Link>
              <button className="recent-event-action" type="button" onClick={() => setConfirmation({ event, permanent: false })} aria-label={`Delete ${event.name}`}><Trash2 size={15} /></button>
            </div>
          </article>
        ))}
        {loading && <div className="admin-list-message">Loading events…</div>}
        {!loading && !error && visibleEvents.length === 0 && <div className="admin-list-message">{showDeleted ? 'Recently Deleted is empty.' : 'No events yet.'}</div>}
      </div>
      {!showDeleted && <div className="admin-pagination"><span>Showing {events.length ? (page - 1) * 20 + 1 : 0}–{Math.min(page * 20, total)} of {total}</span><div><button onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page === 1}><ArrowLeft size={14} /> Previous</button><button onClick={() => setPage((value) => value + 1)} disabled={page * 20 >= total}>Next <ArrowRight size={14} /></button></div></div>}

      <dialog className="event-confirm-dialog" ref={dialogRef} onCancel={(event) => { event.preventDefault(); if (!busy) setConfirmation(null) }}>
        <span className="admin-eyebrow">{confirmation?.permanent ? 'PERMANENT ACTION' : 'RECOVERABLE ACTION'}</span>
        <h2>{confirmation?.permanent ? 'Delete this event permanently?' : 'Move this event to Recently Deleted?'}</h2>
        <p>{confirmation?.permanent
          ? 'This event will be removed now and cannot be restored.'
          : 'It will disappear from public listings immediately and can be restored for 30 days.'}</p>
        <div className="event-confirm-actions">
          <button className="admin-secondary-button" type="button" onClick={() => setConfirmation(null)} disabled={busy}>Cancel</button>
          <button className={confirmation?.permanent ? 'admin-danger-button' : 'admin-primary-button'} type="button" onClick={confirmAction} disabled={busy}>{busy ? 'Working…' : confirmation?.permanent ? 'Delete permanently' : 'Delete event'}</button>
        </div>
      </dialog>
    </div>
  )
}
