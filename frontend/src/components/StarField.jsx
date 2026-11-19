import { useEffect, useMemo, useRef } from 'react'

/**
 * Three sparse depth layers of small cream points that drift slowly and
 * continuously. On fine pointers the layers also move opposite to the cursor,
 * nearer layers further, giving depth. One shared pointer listener stores
 * numbers only; each field animates with requestAnimationFrame (no React
 * re-renders) while it is on screen and the tab is visible. Reduced-motion
 * users get the same stars, static.
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
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (!root || reducedMotion.matches) return undefined
    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches

    const elements = [...root.children]
    // Each layer drifts on its own slow ellipse; nearer layers move a little more,
    // so the field keeps a gentle sense of depth even when the cursor is still.
    const layers = elements.map((element, index) => {
      const depth = Number(element.dataset.depth) || 0
      return {
        element,
        depth,
        amplitude: depth * 0.45,
        period: 70 - index * 14, // seconds per loop: 70s, 56s, 42s
        phase: index * 2.1 + (seed % 7),
        last: '',
      }
    })
    let px = 0
    let py = 0
    let frame = 0
    let visible = false
    const startedAt = performance.now()

    const step = (now) => {
      // Ease the parallax towards the opposite of the pointer (fine pointers only).
      if (finePointer) {
        px += (-pointer.x - px) * 0.06
        py += (-pointer.y - py) * 0.06
      }
      const t = (now - startedAt) / 1000
      for (const layer of layers) {
        const angle = (t / layer.period) * Math.PI * 2 + layer.phase
        const x = Math.sin(angle) * layer.amplitude + px * layer.depth
        const y = Math.cos(angle * 0.8) * layer.amplitude * 0.6 + py * layer.depth
        const transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0)`
        if (transform !== layer.last) {
          layer.element.style.transform = transform
          layer.last = transform
        }
      }
      frame = requestAnimationFrame(step)
    }
    const start = () => {
      if (visible && !document.hidden && !frame) frame = requestAnimationFrame(step)
    }
    const stop = () => {
      cancelAnimationFrame(frame)
      frame = 0
    }
    // Run only while the field is on screen and the tab is visible.
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting
      if (visible) start()
      else stop()
    })
    observer.observe(root)
    const onVisibility = () => (document.hidden ? stop() : start())
    document.addEventListener('visibilitychange', onVisibility)
    const unsubscribe = finePointer ? subscribe(start) : () => {}

    return () => {
      stop()
      observer.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
      unsubscribe()
    }
  }, [seed])

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
