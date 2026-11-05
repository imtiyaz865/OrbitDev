import { useEffect, useMemo, useRef } from 'react'

/**
 * Three sparse depth layers of small cream points. On fine pointers the
 * layers drift opposite to the cursor, nearer layers further, giving depth.
 * One shared pointer listener stores numbers only; each field animates with
 * requestAnimationFrame while it is on screen and stops once it settles.
 * Touch devices and reduced-motion users get the same stars, static.
 */
const LAYERS = [
  { count: 30, depth: 8, radius: [0.5, 0.8], opacity: [0.16, 0.3] },
  { count: 16, depth: 18, radius: [0.7, 1.1], opacity: [0.28, 0.46] },
  { count: 7, depth: 32, radius: [1, 1.4], opacity: [0.45, 0.7] },
]

function random(seed) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6D2B79F5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function buildLayers(seed) {
  const next = random(seed)
  const between = ([min, max]) => min + (max - min) * next()
  return LAYERS.map((layer) => ({
    depth: layer.depth,
    stars: Array.from({ length: layer.count }, () => ({
      x: (next() * 100).toFixed(2),
      y: (next() * 100).toFixed(2),
      r: between(layer.radius).toFixed(2),
      o: between(layer.opacity).toFixed(2),
    })),
  }))
}

// Shared pointer position, normalised to -1…1 from the viewport centre.
const pointer = { x: 0, y: 0, subscribers: new Set() }
function onPointerMove(event) {
  if (event.pointerType && event.pointerType !== 'mouse') return
  pointer.x = (event.clientX / window.innerWidth) * 2 - 1
  pointer.y = (event.clientY / window.innerHeight) * 2 - 1
  pointer.subscribers.forEach((wake) => wake())
}
function subscribe(wake) {
  if (pointer.subscribers.size === 0) window.addEventListener('pointermove', onPointerMove, { passive: true })
  pointer.subscribers.add(wake)
  return () => {
    pointer.subscribers.delete(wake)
    if (pointer.subscribers.size === 0) window.removeEventListener('pointermove', onPointerMove)
  }
}

export function StarField({ seed = 11, className = '' }) {
  const ref = useRef(null)
  const layers = useMemo(() => buildLayers(seed), [seed])

  useEffect(() => {
    const root = ref.current
    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)')
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (!root || !finePointer.matches || reducedMotion.matches) return undefined

    const elements = [...root.children]
    const depths = elements.map((element) => Number(element.dataset.depth) || 0)
    let x = 0
    let y = 0
    let frame = 0
    let visible = false

    const step = () => {
      x += (-pointer.x - x) * 0.06
      y += (-pointer.y - y) * 0.06
      elements.forEach((element, index) => {
        element.style.transform = `translate3d(${(x * depths[index]).toFixed(2)}px, ${(y * depths[index]).toFixed(2)}px, 0)`
      })
      const settled = Math.abs(-pointer.x - x) < 0.001 && Math.abs(-pointer.y - y) < 0.001
      frame = visible && !settled ? requestAnimationFrame(step) : 0
    }
    const wake = () => {
      if (visible && !frame) frame = requestAnimationFrame(step)
    }
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting
      if (visible) wake()
    })
    observer.observe(root)
    const unsubscribe = subscribe(wake)

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      unsubscribe()
    }
  }, [])

  return (
    <div ref={ref} className={`o-stars ${className}`.trim()} aria-hidden="true">
      {layers.map((layer) => (
        <svg key={layer.depth} className="o-stars-layer" data-depth={layer.depth} focusable="false">
          {layer.stars.map((star, index) => (
            <circle key={index} cx={`${star.x}%`} cy={`${star.y}%`} r={star.r} fillOpacity={star.o} />
          ))}
        </svg>
      ))}
    </div>
  )
}
