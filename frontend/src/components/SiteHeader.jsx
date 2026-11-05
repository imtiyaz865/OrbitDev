import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ArrowUpRight } from 'lucide-react'
import { Logo } from './Logo.jsx'
import { communityLinks, validExternalUrl } from '../data/communityLinks.js'
import { isActivePath, primaryNavigation, updatesLink } from '../data/navigation.js'

export function UpdatesCta({ className, onNavigate, label = 'Get updates' }) {
  const link = updatesLink()
  const content = <><span>{label}</span><ArrowUpRight size={15} strokeWidth={1.5} aria-hidden="true" /></>
  return link.external
    ? <a className={className} href={link.href} target="_blank" rel="noopener noreferrer" aria-label={`${label} on WhatsApp (opens in a new tab)`}>{content}</a>
    : <Link className={className} to={link.href} onClick={onNavigate}>{content}</Link>
}

export function SiteHeader() {
  const { pathname } = useLocation()
  const [scrolled, setScrolled] = useState(false)
  const [hidden, setHidden] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const toggleRef = useRef(null)
  const panelRef = useRef(null)

  useEffect(() => setMenuOpen(false), [pathname])

  useEffect(() => {
    let lastY = window.scrollY
    let ticking = false
    const update = () => {
      const y = window.scrollY
      setScrolled(y > 16)
      if (Math.abs(y - lastY) > 6) {
        setHidden(y > 480 && y > lastY)
        lastY = y
      }
      ticking = false
    }
    const onScroll = () => {
      if (ticking) return
      ticking = true
      requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    const root = document.documentElement
    if (!menuOpen) return undefined
    root.classList.add('o-menu-open')
    panelRef.current?.querySelector('a')?.focus()
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setMenuOpen(false)
        toggleRef.current?.focus()
        return
      }
      if (event.key !== 'Tab' || !panelRef.current) return
      const focusable = [toggleRef.current, ...panelRef.current.querySelectorAll('a[href]')].filter(Boolean)
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    const onResize = () => { if (window.innerWidth >= 960) setMenuOpen(false) }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('resize', onResize)
      root.classList.remove('o-menu-open')
    }
  }, [menuOpen])

  const headerClass = [
    'o-header',
    scrolled && 'is-scrolled',
    hidden && !menuOpen && 'is-hidden',
    menuOpen && 'is-menu-open',
  ].filter(Boolean).join(' ')

  return (
    <header className={headerClass}>
      <div className="o-header-bar">
        <Link to="/" className="o-header-logo" aria-label="The Orbit, home">
          <Logo tone="light" />
        </Link>

        <nav className="o-nav" aria-label="Main">
          {primaryNavigation.map((item) => {
            const active = isActivePath(pathname, item.to)
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`o-nav-link${active ? ' is-active' : ''}`}
                aria-current={active ? 'page' : undefined}
              >
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div className="o-header-end">
          <UpdatesCta className="o-header-cta" />
          <button
            ref={toggleRef}
            type="button"
            className="o-menu-toggle"
            aria-expanded={menuOpen}
            aria-controls="o-mobile-menu"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span className="o-menu-toggle-icon" aria-hidden="true"><i /><i /></span>
          </button>
        </div>
      </div>

      <div
        id="o-mobile-menu"
        ref={panelRef}
        className="o-menu"
        role="dialog"
        aria-modal="true"
        aria-label="Site menu"
        hidden={!menuOpen}
      >
        <nav className="o-menu-nav" aria-label="Mobile">
          {primaryNavigation.map((item) => {
            const active = isActivePath(pathname, item.to)
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`o-menu-link${active ? ' is-active' : ''}`}
                aria-current={active ? 'page' : undefined}
                onClick={() => setMenuOpen(false)}
              >
                {item.label}
              </Link>
            )
          })}
        </nav>
        <div className="o-menu-foot">
          <UpdatesCta className="o-button o-button-light" label="Get weekly updates" onNavigate={() => setMenuOpen(false)} />
          <div className="o-menu-social">
            {communityLinks.map(({ name, url }) => {
              const href = validExternalUrl(url)
              return href ? <a key={name} href={href} target="_blank" rel="noopener noreferrer">{name}</a> : null
            })}
          </div>
        </div>
      </div>
    </header>
  )
}
