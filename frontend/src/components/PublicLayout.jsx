import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { SiteHeader } from './SiteHeader.jsx'
import { SiteFooter } from './SiteFooter.jsx'
import { OrbitCursor } from './OrbitCursor.jsx'
import '../styles/site.css'

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Native scrolling throughout (no wheel hijacking). New routes start at the
 * top instantly; in-page anchors glide there unless reduced motion is set.
 */
function useScrollOnNavigate() {
  const { pathname, hash } = useLocation()
  useEffect(() => {
    if (!hash) {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
      return undefined
    }
    // Wait a frame so the target section exists before scrolling to it.
    const id = requestAnimationFrame(() => {
      document.getElementById(decodeURIComponent(hash.slice(1)))
        ?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' })
    })
    return () => cancelAnimationFrame(id)
  }, [pathname, hash])
}

/** Public pages hide the visual scrollbar; scrolling itself is untouched. */
function usePublicDocumentClass() {
  useEffect(() => {
    const root = document.documentElement
    root.classList.add('o-public')
    return () => root.classList.remove('o-public')
  }, [])
}

export function PublicLayout() {
  useScrollOnNavigate()
  usePublicDocumentClass()
  return (
    <div className="site" id="top">
      <a className="o-skip" href="#main">Skip to content</a>
      <OrbitCursor />
      <SiteHeader />
      <main id="main" tabIndex={-1}>
        <Outlet />
      </main>
      <SiteFooter />
    </div>
  )
}
