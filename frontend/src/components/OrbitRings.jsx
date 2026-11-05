/**
 * The Orbit's hero geometry, restored from the original design: faint axes,
 * an outer orbit, a dashed mid orbit, an inner orbit and two orbiting bodies.
 * The static rings are one SVG; the bodies ride on separate HTML layers whose
 * rotation is a pure CSS transform, so the browser composites it on the GPU
 * instead of repainting a large SVG every frame. Purely decorative.
 */
export function OrbitRings({ className = '' }) {
  return (
    <div className={`o-orbit ${className}`.trim()} aria-hidden="true">
      <svg className="o-rings" viewBox="0 0 600 600" focusable="false">
        <line className="o-rings-axis" x1="0" y1="300" x2="600" y2="300" />
        <line className="o-rings-axis" x1="300" y1="0" x2="300" y2="600" />
        <circle cx="300" cy="300" r="296" />
        <circle className="o-rings-dashed" cx="300" cy="300" r="214" />
        <circle cx="300" cy="300" r="118" />
      </svg>
      <span className="o-orbit-arm"><i className="o-orbit-body is-outer" /></span>
      <span className="o-orbit-arm is-slow"><i className="o-orbit-body is-inner" /></span>
    </div>
  )
}

/**
 * Consistent artwork for events without a banner: a quiet orbit mark on
 * black. Never initials or invented imagery.
 */
export function EventArtwork() {
  return (
    <div className="o-artwork" aria-hidden="true">
      <svg viewBox="0 0 100 100" focusable="false">
        <circle cx="50" cy="50" r="44" className="o-artwork-orbit" />
        <circle cx="50" cy="50" r="17" className="o-artwork-core" />
        <circle cx="81.1" cy="18.9" r="4.2" className="o-artwork-body" />
      </svg>
    </div>
  )
}
