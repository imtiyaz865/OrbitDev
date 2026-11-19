import { toast } from 'react-toastify'

const STATUS_LABELS = { draft: 'Draft', published: 'Published', archived: 'Archived' }

function formatDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}/.test(value || '')) return null
  return new Date(`${value.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
}

function DuplicateNotice({ duplicates, proceedLabel, onProceed, closeToast }) {
  const [first, ...others] = duplicates
  const certain = first.confidence === 'certain' || first.confidence === 'high'
  return (
    <div className="duplicate-toast">
      <strong className="duplicate-toast-title">⚠️ {certain ? 'This event already exists in The Orbit!' : 'This event may already exist in The Orbit.'}</strong>
      <p className="duplicate-toast-event">
        <span>“{first.name}”</span>
        <small>{[STATUS_LABELS[first.status] || first.status, formatDate(first.start_date), first.organizer_name].filter(Boolean).join(' · ')}</small>
      </p>
      {first.reasons?.length > 0 && <p className="duplicate-toast-reasons">{first.reasons.join(' · ')}</p>}
      {others.length > 0 && <p className="duplicate-toast-reasons">Also similar: {others.map((item) => `“${item.name}”`).join(', ')}</p>}
      <div className="duplicate-toast-actions">
        {/* A new tab keeps the current form intact. */}
        <a className="admin-secondary-button" href={`/admin/events/${first.id}/edit`} target="_blank" rel="noreferrer">Open existing event</a>
        {onProceed && <button className="admin-inline-link" type="button" onClick={() => { closeToast?.(); onProceed() }}>{proceedLabel}</button>}
      </div>
    </div>
  )
}

/**
 * Shows the duplicate warning used across the admin panel. It stays open until the
 * administrator acts. `onProceed` (optional) continues after they confirm the match
 * is a different event; nothing is created or overwritten before that.
 */
export function showDuplicateToast(duplicates, { onProceed = null, proceedLabel = 'Not a duplicate — continue', toastId = 'duplicate-event' } = {}) {
  if (!duplicates?.length) return
  const content = ({ closeToast }) => <DuplicateNotice duplicates={duplicates} proceedLabel={proceedLabel} onProceed={onProceed} closeToast={closeToast} />
  const options = { toastId, autoClose: false, closeOnClick: false, draggable: false, className: 'duplicate-toast-shell' }
  if (toast.isActive(toastId)) toast.update(toastId, { render: content, ...options })
  else toast.warning(content, options)
}

export function isDuplicateError(error) {
  return error?.code === 'duplicate_event' && error.duplicates?.length > 0
}
