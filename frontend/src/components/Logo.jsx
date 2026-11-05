/**
 * The Orbit brand assets, served as supplied (no recolouring or redrawing).
 * `tone` is the colour of the logo itself: "light" for dark backgrounds,
 * "dark" for light backgrounds.
 */
const ASSETS = {
  lockup: {
    light: '/brand/orbit-lockup-light.png',
    dark: '/brand/orbit-lockup-dark.png',
    width: 1550,
    height: 430,
  },
  mark: {
    light: '/brand/orbit-mark-light.png',
    dark: '/brand/orbit-mark-dark.png',
    width: 751,
    height: 749,
  },
}

export function Logo({ variant = 'lockup', tone = 'light', className = '' }) {
  const asset = ASSETS[variant] || ASSETS.lockup
  return (
    <img
      className={`o-logo o-logo-${variant} ${className}`.trim()}
      src={asset[tone] || asset.light}
      alt="The Orbit"
      width={asset.width}
      height={asset.height}
      decoding="async"
    />
  )
}
