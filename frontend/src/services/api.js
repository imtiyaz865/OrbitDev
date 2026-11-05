const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '')

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(payload.error?.message || payload.message || `Request failed (${response.status})`)
  }
  return payload.data ?? payload
}

function getDevelopmentEvents() {
  if (!import.meta.env.DEV) return Promise.reject(new Error('Local event data is only available in development.'))
  return import('./developmentEvents.js')
}

export const api = {
  getWeekendEvents: (start, end, signal) => {
    if (import.meta.env.DEV) {
      return getDevelopmentEvents().then(({ getWeekendEvents }) => getWeekendEvents(start, end, signal))
    }
    return request(
      `/events/weekends?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`,
      { signal },
    )
  },
  getEvent: (slug, signal) => {
    if (import.meta.env.DEV) {
      return getDevelopmentEvents().then(({ getEvent }) => getEvent(slug, signal))
    }
    return request(`/events/${encodeURIComponent(slug)}`, { signal })
  },
}
