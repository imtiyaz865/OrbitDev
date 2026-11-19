import { useEffect, useMemo, useState } from 'react'
import { safeImageUrl, sizedImageUrl } from '../utils/imageUrl.js'

/**
 * A remote event image with a loading state and graceful fallbacks.
 *
 * - Requests a CDN rendition sized for its slot (`width`) where the CDN supports
 *   it, and falls back to the original URL if that rendition fails.
 * - Shows `fallback` only when the image genuinely cannot load (expired or
 *   blocked links), never in place of an image that is available.
 * - With `adaptive`, posters much taller than the frame (square or portrait)
 *   are shown whole (`contain`) over a soft blurred copy instead of being
 *   cropped; wide images keep `cover`. The parent must be positioned.
 * - Sends no referrer, which hotlink-protected hosts usually accept.
 */
export function EventImage({
  src,
  alt = '',
  width,
  className = '',
  adaptive = false,
  frameRatio = 16 / 9,
  loading = 'lazy',
  fetchPriority,
  objectPosition,
  fallback = null,
}) {
  const original = useMemo(() => safeImageUrl(src), [src])
  const sized = useMemo(() => sizedImageUrl(original, width), [original, width])
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState({ loaded: false, contain: false })

  useEffect(() => {
    setAttempt(0)
    setState({ loaded: false, contain: false })
  }, [original, sized])

  if (!original || attempt > 1 || (attempt === 1 && sized === original)) return fallback
  const current = attempt === 0 ? sized : original

  function handleLoad(event) {
    const { naturalWidth, naturalHeight } = event.currentTarget
    const ratio = naturalHeight ? naturalWidth / naturalHeight : frameRatio
    setState({ loaded: true, contain: adaptive && ratio < frameRatio * 0.8 })
  }

  const classes = [className, state.loaded ? 'is-loaded' : 'is-loading', state.contain ? 'is-contained' : ''].filter(Boolean).join(' ')
  return (
    <>
      {state.contain && (
        <span className="o-img-backdrop" style={{ backgroundImage: `url(${JSON.stringify(current)})` }} aria-hidden="true" />
      )}
      <img
        key={current}
        className={classes}
        src={current}
        alt={alt}
        loading={loading}
        decoding="async"
        referrerPolicy="no-referrer"
        fetchpriority={fetchPriority}
        style={objectPosition && !state.contain ? { objectPosition } : undefined}
        onLoad={handleLoad}
        onError={() => setAttempt((value) => value + 1)}
      />
    </>
  )
}
