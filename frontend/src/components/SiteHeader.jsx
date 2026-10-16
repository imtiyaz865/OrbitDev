import { Link, useLocation } from 'react-router-dom'
import { useEffect, useRef, useState } from 'react'
import { Moon, Sun } from 'lucide-react'
import { useTheme } from '../hooks/ThemeContext.jsx'

export function SiteHeader() {
  const { theme, toggleTheme } = useTheme()
  const location = useLocation()
  const [isScrolled, setIsScrolled] = useState(false)
  const isScrolledRef = useRef(false)

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

  return (
    <header className={`site-header${isScrolled ? ' is-scrolled' : ''}`}>
      <div className="site-header-inner">
        <Link to="/" className="wordmark" aria-label="The Orbit home">
          <span>the orbit</span>
        </Link>
        <nav className="main-nav" aria-label="Main navigation">
          <Link to="/#weekend-list" className={`nav-link${location.pathname === '/' ? ' nav-link-active' : ''}`}>
            Weekend events
          </Link>
        </nav>
        <button className="theme-button" onClick={toggleTheme} aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}>
          {theme === 'light' ? <Moon size={17} strokeWidth={1.7} /> : <Sun size={17} strokeWidth={1.7} />}
        </button>
      </div>
    </header>
  )
}
