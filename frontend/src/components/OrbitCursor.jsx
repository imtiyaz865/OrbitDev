import { useEffect, useRef } from 'react'

const BUTTONS = 'button:not(:disabled), [role="button"], .o-button, .o-header-cta, .o-icon-button, summary, select'
const LINKS = 'a[href], label'
const TEXT_ENTRY = 'input, textarea, [contenteditable="true"]'

/**
 * Precise "+" cursor for fine pointers, restored from the original design:
 * it rotates a quarter turn over interactive elements. Links get a slightly
 * larger plus; buttons open into a crosshair. It never captures pointer
 * events, and touch, pen, text entry and reduced motion keep the native cursor.
 */
export function OrbitCursor() {
  const ref = useRef(null)

  useEffect(() => {
    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)')
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (!finePointer.matches || reducedMotion.matches || !ref.current) return undefined

    const cursor = ref.current
    const root = document.documentElement
    let targetX = -100
    let targetY = -100
    let x = targetX
    let y = targetY
    let frame = 0
    let visible = false
    let lastTarget = null

    root.classList.add('has-orbit-cursor')

    const place = (nextX, nextY) => {
      cursor.style.transform = `translate3d(${nextX}px, ${nextY}px, 0)`
    }
    const step = () => {
      x += (targetX - x) * 0.38
      y += (targetY - y) * 0.38
      place(x, y)
      frame = Math.abs(targetX - x) > 0.1 || Math.abs(targetY - y) > 0.1 ? requestAnimationFrame(step) : 0
    }
    const hide = () => {
      visible = false
      cursor.classList.remove('is-visible')
    }
    const updateState = (target) => {
      if (target === lastTarget) return
      lastTarget = target
      const button = Boolean(target?.closest(BUTTONS))
      cursor.classList.toggle('is-button', button)
      cursor.classList.toggle('is-link', !button && Boolean(target?.closest(LINKS)))
      cursor.classList.toggle('is-text', Boolean(target?.closest(TEXT_ENTRY)))
    }
    const onMove = (event) => {
      if (event.pointerType && event.pointerType !== 'mouse') {
        hide()
        return
      }
      targetX = event.clientX
      targetY = event.clientY
      updateState(event.target instanceof Element ? event.target : null)
      if (!visible) {
        visible = true
        x = targetX
        y = targetY
        place(x, y)
        cursor.classList.add('is-visible')
        return
      }
      if (!frame) frame = requestAnimationFrame(step)
    }
    const onDown = () => cursor.classList.add('is-pressed')
    const onUp = () => cursor.classList.remove('is-pressed')

    document.addEventListener('pointermove', onMove, { passive: true })
    document.addEventListener('pointerdown', onDown, { passive: true })
    document.addEventListener('pointerup', onUp, { passive: true })
    root.addEventListener('mouseleave', hide)
    window.addEventListener('blur', hide)

    return () => {
      cancelAnimationFrame(frame)
      root.classList.remove('has-orbit-cursor')
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('pointerup', onUp)
      root.removeEventListener('mouseleave', hide)
      window.removeEventListener('blur', hide)
    }
  }, [])

  return <div ref={ref} className="o-cursor" aria-hidden="true"><span /></div>
}
