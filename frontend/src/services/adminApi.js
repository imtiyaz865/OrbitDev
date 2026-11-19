import { getSupabaseClient } from './supabase.js'

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '')

async function request(path, options = {}) {
  const { data: { session } } = await getSupabaseClient().auth.getSession()
  if (!session?.access_token) throw new Error('Your session has ended. Sign in again.')
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${session.access_token}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(payload.error?.message || `Request failed (${response.status})`)
    error.status = response.status
    error.code = payload.error?.code || null
    // A 409 duplicate_event response lists the existing events that match.
    error.duplicates = Array.isArray(payload.error?.duplicates) ? payload.error.duplicates : []
    throw error
  }
  return payload.data ?? payload
}

async function download(path) {
  const { data: { session } } = await getSupabaseClient().auth.getSession()
  if (!session?.access_token) throw new Error('Your session has ended. Sign in again.')
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${session.access_token}`, Accept: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/json' },
  })
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}))
    throw new Error(payload.error?.message || `Download failed (${response.status})`)
  }
  const disposition = response.headers.get('content-disposition') || ''
  const filename = disposition.match(/filename="([^"]+)"/i)?.[1] || 'the-orbit-events.xlsx'
  return { blob: await response.blob(), filename }
}

export const adminApi = {
  getDashboard: () => request('/admin/dashboard'),
  getEvents: (query = {}, { signal } = {}) => {
    const params = new URLSearchParams(Object.entries(query).filter(([, value]) => value !== '' && value != null))
    return request(`/admin/events?${params}`, { signal })
  },
  getDeletedEvents: (query = {}, { signal } = {}) => {
    const params = new URLSearchParams(Object.entries(query).filter(([, value]) => value !== '' && value != null))
    return request(`/admin/events/deleted?${params}`, { signal })
  },
  getIntegrationSettings: () => request('/admin/settings/integrations'),
  getEvent: (id) => request(`/admin/events/${encodeURIComponent(id)}`),
  importEvent: (url, { signal, updateExisting = false, allowDuplicate = false } = {}) => request('/admin/import', { method: 'POST', body: JSON.stringify({ url, update_existing: updateExisting, allow_duplicate: allowDuplicate }), signal }),
  checkDuplicates: (candidate) => request('/admin/events/check-duplicates', { method: 'POST', body: JSON.stringify(candidate) }),
  // allowDuplicate is sent only after the administrator confirms a flagged match is a different event.
  createEvent: (event, { allowDuplicate = false } = {}) => request('/admin/events', { method: 'POST', body: JSON.stringify(allowDuplicate ? { ...event, allow_duplicate: true } : event) }),
  updateEvent: (id, event) => request(`/admin/events/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(event) }),
  publishEvent: (id, { allowDuplicate = false } = {}) => request(`/admin/events/${encodeURIComponent(id)}/publish`, { method: 'POST', ...(allowDuplicate ? { body: JSON.stringify({ allow_duplicate: true }) } : {}) }),
  unpublishEvent: (id) => request(`/admin/events/${encodeURIComponent(id)}/unpublish`, { method: 'POST' }),
  deleteEvent: (id) => request(`/admin/events/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  restoreEvent: (id) => request(`/admin/events/${encodeURIComponent(id)}/restore`, { method: 'POST' }),
  permanentlyDeleteEvent: (id) => request(`/admin/events/${encodeURIComponent(id)}/permanent`, { method: 'DELETE' }),
  exportEvents: () => download('/admin/export/events.xlsx'),
  emailEventReport: () => request('/admin/reports/send', { method: 'POST' }),
}
