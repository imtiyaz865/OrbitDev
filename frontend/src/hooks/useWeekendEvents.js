import { useCallback, useEffect, useState } from 'react'
import { api } from '../services/api.js'
import { localDateString } from '../utils/weekends.js'

/** Loads published events for a weekend through the existing public API. */
export function useWeekendEvents(weekend) {
  const start = localDateString(weekend.start)
  const end = localDateString(weekend.end)
  const [state, setState] = useState({ events: [], loading: true, error: '' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    setState((current) => ({ ...current, loading: true, error: '' }))
    api.getWeekendEvents(start, end, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return
        setState({ events: Array.isArray(result) ? result : result?.events || [], loading: false, error: '' })
      })
      .catch((error) => {
        if (controller.signal.aborted || error.name === 'AbortError') return
        setState({ events: [], loading: false, error: error.message || 'Events could not be loaded.' })
      })
    return () => controller.abort()
  }, [start, end, attempt])

  const retry = useCallback(() => setAttempt((count) => count + 1), [])
  return { ...state, retry }
}
