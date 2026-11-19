import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, ArrowUpRight, CalendarDays, RotateCcw, Search, Ticket, Trash2, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { adminApi } from '../../services/adminApi.js'
import { formatEventTimeInIndia } from '../../utils/times.js'
import { Status } from './AdminDashboardPage.jsx'
import { EventImage } from '../../components/EventImage.jsx'
import { pageItems } from '../../utils/pagination.js'

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

const PAGE_SIZE = 20
const DELETED_PAGE_SIZE = 100
const SEARCH_DEBOUNCE_MS = 275
const defaultDirection = { updated: 'desc', date: 'asc', name: 'asc' }
const directionLabels = {
  updated: { desc: 'Newest first', asc: 'Oldest first' },
  date: { asc: 'Upcoming first', desc: 'Latest date first' },
  name: { asc: 'A–Z', desc: 'Z–A' },
}

function isAbort(err, signal) {
  return signal?.aborted || err?.name === 'AbortError'
}

export function AdminEventsPage() {
  const [events, setEvents] = useState([])
  const [deletedEvents, setDeletedEvents] = useState([])
  const [total, setTotal] = useState(0)
  const [deletedTotal, setDeletedTotal] = useState(0)
  const [deletedCount, setDeletedCount] = useState(0)
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('')
  const [sort, setSort] = useState('updated')
  const [direction, setDirection] = useState(defaultDirection.updated)
  const [date, setDate] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [showDeleted, setShowDeleted] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [confirmation, setConfirmation] = useState(null)
  const [busy, setBusy] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const dialogRef = useRef(null)

  // Debounce typing; the query (and page reset) only change once typing pauses.
  useEffect(() => {
    const next = searchInput.trim()
    if (next === search) return undefined
    const timer = window.setTimeout(() => {
      setSearch(next)
      setPage(1)
    }, SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [searchInput, search])

  // Load only the list that is on screen. A newer request aborts the previous
  // one, so a slow, stale response can never overwrite newer results.
  useEffect(() => {
    const controller = new AbortController()
    const { signal } = controller
    setLoading(true)
    const request = showDeleted
      ? adminApi.getDeletedEvents({ page: 1, page_size: DELETED_PAGE_SIZE, search }, { signal })
      : adminApi.getEvents({ page, page_size: PAGE_SIZE, status, search, sort, direction, date }, { signal })
    request
      .then((result) => {
        if (signal.aborted) return
        if (showDeleted) {
          setDeletedEvents(result.events || [])
          setDeletedTotal(result.total || 0)
        } else {
          setEvents(result.events || [])
          setTotal(result.total || 0)
        }
        setError('')
      })
      .catch((err) => { if (!isAbort(err, signal)) setError(err.message) })
      .finally(() => { if (!signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [showDeleted, page, status, search, sort, direction, date, refreshKey])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  // If the result set shrinks (filters, deletions), step back to the last page that exists.
  useEffect(() => {
    if (!loading && !showDeleted && total > 0 && page > totalPages) setPage(totalPages)
  }, [loading, showDeleted, total, page, totalPages])

  function changeDate(value) {
    setDate(value)
    setPage(1)
  }

  // The Recently Deleted badge needs only a count: one projected row, not 100 records.
  useEffect(() => {
    const controller = new AbortController()
    adminApi.getDeletedEvents({ page: 1, page_size: 1 }, { signal: controller.signal })
      .then((result) => { if (!controller.signal.aborted) setDeletedCount(result.total || 0) })
      .catch(() => {})
    return () => controller.abort()
  }, [refreshKey])

  function changeSort(value) {
    setSort(value)
    setDirection(defaultDirection[value] || 'desc')
    setPage(1)
  }

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
        <label className="admin-search"><Search size={16} /><input type="search" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Search events" aria-label="Search events" /></label>
        {!showDeleted && <div className="event-filter-tabs" role="group" aria-label="Filter events">
          {filters.map((filter) => <button className={status === filter.value ? 'is-selected' : ''} key={filter.value} onClick={() => { setPage(1); setStatus(filter.value) }} aria-pressed={status === filter.value}>{filter.label}</button>)}
        </div>}
        <button className={`event-trash-toggle${showDeleted ? ' is-selected' : ''}`} type="button" onClick={() => { setPage(1); setShowDeleted((visible) => !visible) }} aria-pressed={showDeleted}>
          <Trash2 size={14} /> Recently Deleted <span>{deletedCount}</span>
        </button>
        {!showDeleted && <>
          <label className="sr-only" htmlFor="event-sort">Sort events</label>
          <select id="event-sort" value={sort} onChange={(event) => changeSort(event.target.value)} aria-label="Sort events"><option value="updated">Recently updated</option><option value="date">Event date</option><option value="name">Name</option></select>
          <label className="sr-only" htmlFor="event-sort-direction">Sort direction</label>
          <select id="event-sort-direction" value={direction} onChange={(event) => { setDirection(event.target.value); setPage(1) }} aria-label="Sort direction">
            {Object.entries(directionLabels[sort]).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <div className={`event-date-filter${date ? ' is-active' : ''}`}>
            <CalendarDays size={15} aria-hidden="true" />
            <input type="date" value={date} onChange={(event) => changeDate(event.target.value)} aria-label="Show events on date (Asia/Kolkata)" />
            {date && <button type="button" onClick={() => changeDate('')} aria-label="Clear date filter"><X size={14} /></button>}
          </div>
        </>}
        <span className="admin-result-count">{visibleTotal} {visibleTotal === 1 ? 'event' : 'events'}</span>
      </div>
      {error && <div className="admin-alert" role="alert">{error}</div>}
      {showDeleted && <p className="trash-retention-note">Deleted events are recoverable for 30 days. Restoring keeps the existing publication status.{deletedTotal > DELETED_PAGE_SIZE && ` Showing the ${DELETED_PAGE_SIZE} most recently deleted; search to find others.`}</p>}
      <div className="event-library-list">
        <div className={`event-library-head${showDeleted ? ' is-deleted' : ''}`} aria-hidden="true">
          <span>EVENT</span><span>{showDeleted ? 'DELETED' : 'DATE'}</span>{!showDeleted && <><span>ORGANIZER</span><span>STATUS</span></>}<span />
        </div>
        {visibleEvents.map((event) => showDeleted ? (
          <article className="event-library-row is-deleted" key={event.id}>
            <EventImage className="library-event-image" src={event.banner_url} width={120} fallback={<span className="library-event-image library-event-image-empty"><Ticket size={16} /></span>} />
            <div className="library-event-title"><strong>{event.name}</strong><small>{event.event_type || event.source_platform || 'Event'} · <Status status={event.status} /></small></div>
            <span className="library-event-date">{displayDate(event.deleted_at)}<small>{recoveryDays(event.deleted_at)} days remaining</small></span>
            <div className="trash-event-actions">
              <button className="admin-secondary-button" type="button" onClick={() => restoreEvent(event)} disabled={busy} aria-label={`Restore ${event.name}`}><RotateCcw size={14} /> Restore</button>
              <button className="admin-danger-button" type="button" onClick={() => setConfirmation({ event, permanent: true })} disabled={busy} aria-label={`Delete ${event.name} permanently`}><Trash2 size={14} /> Delete permanently</button>
            </div>
          </article>
        ) : (
          <article className="event-library-row" key={event.id}>
            <EventImage className="library-event-image" src={event.banner_url} width={120} fallback={<span className="library-event-image library-event-image-empty"><Ticket size={16} /></span>} />
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
        {!loading && !error && visibleEvents.length === 0 && <div className="admin-list-message">{showDeleted ? 'Recently Deleted is empty.' : search || status || date ? 'No events match these filters.' : 'No events yet.'}</div>}
      </div>
      {!showDeleted && total > 0 && (
        <nav className="admin-pagination" aria-label="Event pages">
          <span>Showing {events.length ? (page - 1) * PAGE_SIZE + 1 : 0}–{Math.min(page * PAGE_SIZE, total)} of {total}</span>
          <div>
            <button type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page === 1}><ArrowLeft size={14} /> Previous</button>
            {pageItems(page, totalPages).map((item, index) => (item === 'gap'
              ? <span key={`gap-${index}`} className="admin-page-gap" aria-hidden="true">…</span>
              : <button type="button" key={item} className={`admin-page-number${item === page ? ' is-current' : ''}`} onClick={() => setPage(item)} aria-label={`Page ${item}`} aria-current={item === page ? 'page' : undefined}>{item}</button>))}
            <button type="button" onClick={() => setPage((value) => Math.min(totalPages, value + 1))} disabled={page >= totalPages}>Next <ArrowRight size={14} /></button>
          </div>
        </nav>
      )}

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
