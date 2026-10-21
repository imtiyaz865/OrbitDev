import { useEffect, useRef, useState } from 'react'
import { ArrowUpRight, Menu, Moon, Sun, X } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { useColorScheme, useTouchFirstDevice } from '../contexts/ColorSchemeContext.jsx'

export function SiteHeader() {
  const location = useLocation()
  const [isScrolled, setIsScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const isScrolledRef = useRef(false)
  const { scheme, toggleScheme } = useColorScheme()
  const isTouchFirst = useTouchFirstDevice()
  const nextScheme = scheme === 'dark' ? 'light' : 'dark'

  useEffect(() => {
    const updateScrollState = () => {
      const next = window.scrollY > 24
      if (next === isScrolledRef.current) return
      isScrolledRef.current = next
      setIsScrolled(next)
    }
    isScrolledRef.current = false
    updateScrollState()
    window.addEventListener('scroll', updateScrollState, { passive: true })
    return () => window.removeEventListener('scroll', updateScrollState)
  }, [location.pathname])

  useEffect(() => setMenuOpen(false), [location.pathname, location.hash])

  return (
    <header className={`site-header${isScrolled ? ' is-scrolled' : ''}`}>
      <div className="site-header-inner">
        <Link to="/" className="wordmark" aria-label="ORBIT home">ORBIT</Link>
        <nav id="public-navigation" className={`main-nav${menuOpen ? ' is-open' : ''}`} aria-label="Main navigation">
          <Link
            to="/"
            className={`nav-link${location.pathname === '/' ? ' nav-link-active' : ''}`}
            aria-current={location.pathname === '/' ? 'page' : undefined}
          >
            Home
          </Link>
          <Link
            to="/#weekend-list"
            className="nav-link"
          >
            Events
          </Link>
          <Link to="/community" className="mobile-create-link">Join us <ArrowUpRight size={16} /></Link>
        </nav>
        <div className="site-header-actions">
          {isTouchFirst && (
            <button
              className="theme-toggle"
              type="button"
              onClick={toggleScheme}
              aria-label={`Switch to ${nextScheme} mode`}
              aria-pressed={scheme === 'dark'}
              title={`Switch to ${nextScheme} mode`}
            >
              {scheme === 'dark' ? <Sun size={16} aria-hidden="true" /> : <Moon size={16} aria-hidden="true" />}
              <span>{scheme === 'dark' ? 'Dark' : 'Light'}</span>
            </button>
          )}
          <Link to="/community" className="create-event-link">Join us</Link>
          <button
            className="mobile-nav-toggle"
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-controls="public-navigation"
            aria-expanded={menuOpen}
          >
            {menuOpen ? <X size={19} /> : <Menu size={19} />}
          </button>
        </div>
      </div>
    </header>
  )
}
