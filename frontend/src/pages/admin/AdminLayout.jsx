import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { ArrowUpRight, CalendarRange, LayoutDashboard, LogOut, Moon, Settings, Sun, Ticket, X } from 'lucide-react'
import { getSupabaseClient } from '../../services/supabase.js'
import { useTheme } from '../../hooks/ThemeContext.jsx'
import { ToastContainer } from 'react-toastify'
import 'react-toastify/dist/ReactToastify.css'
import '../../styles/admin.css'
import { useSeo } from '../../seo/useSeo.js'

export function AdminLayout() {
  useSeo({ title: 'Admin · The Orbit', robots: 'noindex, nofollow' })
  const navigate = useNavigate()
  const location = useLocation()
  const { theme, toggleTheme } = useTheme()
  const [session, setSession] = useState(undefined)
  const [mobileOpen, setMobileOpen] = useState(false)
  const mobileMenuRef = useRef(null)

  useEffect(() => {
    let subscription
    try {
      const supabase = getSupabaseClient()
      supabase.auth.getSession().then(({ data }) => setSession(data.session))
      const result = supabase.auth.onAuthStateChange((_event, currentSession) => setSession(currentSession))
      subscription = result.data.subscription
    } catch {
      setSession(null)
    }
    return () => subscription?.unsubscribe()
  }, [])

  useEffect(() => setMobileOpen(false), [location.pathname])

  useEffect(() => {
    if (!mobileOpen) return
    const closeOnEscape = (event) => {
      if (event.key !== 'Escape') return
      setMobileOpen(false)
      mobileMenuRef.current?.focus()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [mobileOpen])

  function closeMobileNav() {
    setMobileOpen(false)
    mobileMenuRef.current?.focus()
  }

  if (session === undefined) return <div className="admin-loading">Opening workspace…</div>
  if (!session) return <NavigateToLogin navigate={navigate} />

  async function signOut() {
    await getSupabaseClient().auth.signOut()
    navigate('/admin/login', { replace: true })
  }

  return (
    <div className="admin-app">
      {mobileOpen && <button className="admin-mobile-scrim" onClick={closeMobileNav} aria-label="Close navigation"><X size={18} /></button>}
      <aside id="admin-navigation" className={`admin-sidebar${mobileOpen ? ' admin-sidebar-open' : ''}`}>
        <NavLink to="/" className="admin-brand" aria-label="The Orbit public website"><span className="admin-mark" aria-hidden="true"><img className="admin-mark-light" src="/brand/orbit-mark-light.png" alt="" /><img className="admin-mark-dark" src="/brand/orbit-mark-dark.png" alt="" /></span><span>The Orbit</span><span className="admin-brand-tag">OPS</span></NavLink>
        <div className="admin-nav-label">WORKSPACE</div>
        <nav className="admin-nav">
          <NavLink to="/admin" end onClick={closeMobileNav}><LayoutDashboard size={16} />Overview</NavLink>
          <NavLink to="/admin/events" onClick={closeMobileNav}><Ticket size={16} />Events</NavLink>
          <NavLink to="/admin/weekly-update" onClick={closeMobileNav}><CalendarRange size={16} />Weekly update</NavLink>
          <NavLink to="/admin/settings" onClick={closeMobileNav}><Settings size={16} />Settings</NavLink>
        </nav>
        <div className="admin-sidebar-bottom">
          <a className="admin-sidebar-action" href="/" target="_blank" rel="noreferrer"><ArrowUpRight size={15} />Public website</a>
          <details className="admin-account-menu">
            <summary><span className="admin-avatar">{session.user.email?.slice(0, 1).toUpperCase()}</span><span className="admin-account-copy"><strong>Administrator</strong><small>{session.user.email}</small></span><span className="admin-account-caret">···</span></summary>
            <div className="admin-account-popover">
              <button className="admin-sidebar-action" onClick={toggleTheme}>{theme === 'light' ? <Moon size={15} /> : <Sun size={15} />}{theme === 'light' ? 'Dark appearance' : 'Light appearance'}</button>
              <button className="admin-sidebar-action" onClick={signOut}><LogOut size={15} />Sign out</button>
            </div>
          </details>
        </div>
      </aside>
      <div className="admin-main">
        <header className="admin-topbar">
          <button ref={mobileMenuRef} className="admin-mobile-menu" onClick={() => setMobileOpen((open) => !open)} aria-label={mobileOpen ? 'Close navigation menu' : 'Open navigation menu'} aria-controls="admin-navigation" aria-expanded={mobileOpen}><span /><span /></button>
          <span className="admin-breadcrumb">{location.pathname.includes('/weekly-update') ? 'WEEKLY UPDATE' : location.pathname.includes('/events') ? 'EVENTS' : location.pathname.includes('/settings') ? 'SETTINGS' : 'OVERVIEW'}</span>
          <a className="admin-topbar-public" href="/" target="_blank" rel="noreferrer">View public site <ArrowUpRight size={14} /></a>
        </header>
        <div className="admin-content"><Outlet /></div>
      </div>
      <ToastContainer position="top-right" theme={theme === 'dark' ? 'dark' : 'light'} newestOnTop limit={4} pauseOnFocusLoss={false} />
    </div>
  )
}

function NavigateToLogin({ navigate }) {
  useEffect(() => navigate('/admin/login', { replace: true }), [navigate])
  return <div className="admin-loading">Redirecting to sign in…</div>
}
