import { useEffect, useRef, useState } from 'react'

const DEFAULT_DELAY_MS = 4000
const DEFAULT_FADE_MS = 250

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

/**
 * Auto-dismisses a transient success notice.
 *
 * `token` identifies the notice currently shown (falsy = nothing shown). Each new
 * token restarts the timer. After `delay` the notice gets `leaving` (for a CSS
 * fade); `onDismiss` runs once the fade has finished. The timer pauses while the
 * pointer is over the notice or focus is inside it, so links in it stay usable,
 * and restarts when the pointer or focus leaves. All timers are cleared on change
 * and unmount.
 */
export function useAutoDismiss(token, onDismiss, { delay = DEFAULT_DELAY_MS, fadeMs = DEFAULT_FADE_MS } = {}) {
  const [leaving, setLeaving] = useState(false)
  const [paused, setPaused] = useState(false)
  const onDismissRef = useRef(onDismiss)
  onDismissRef.current = onDismiss

  // A new notice starts fully visible and unpaused.
  useEffect(() => {
    setLeaving(false)
    setPaused(false)
  }, [token])

  useEffect(() => {
    if (!token || paused) return undefined
    setLeaving(false)
    const fade = prefersReducedMotion() ? 0 : fadeMs
    const fadeTimer = window.setTimeout(() => setLeaving(true), delay)
    const dismissTimer = window.setTimeout(() => onDismissRef.current?.(), delay + fade)
    return () => {
      window.clearTimeout(fadeTimer)
      window.clearTimeout(dismissTimer)
    }
  }, [token, paused, delay, fadeMs])

  const pauseProps = {
    onMouseEnter: () => setPaused(true),
    onMouseLeave: () => setPaused(false),
    onFocus: () => setPaused(true),
    onBlur: (event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false)
    },
  }

  return { leaving, pauseProps }
}
